import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject, embedMany, cosineSimilarity } from 'ai';
import { z } from 'zod';
import { TwitterApi } from 'twitter-api-v2';
import fs from 'fs/promises';
import path from 'path';
import { appendVectors } from '@/lib/vector-store';

const axisSchema = z.object({
  id: z.string(),
  dimension_name: z.string().describe("軸の名前（例：ガバナンスの方向性）"),
  poles: z.array(z.string()).length(2).describe("両極のラベルA, B"),
  description: z.string().describe("なぜこの軸がこの議論において重要なのかの解説"),
  bridge_hint: z.string().describe("この軸における建設的な第三極（架け橋）を見つけるための着眼点"),
});

const analysisSchema = z.object({
  topic_summary: z.string().describe("トピックの簡潔な要約（100文字以内）"),
  axes: z.array(axisSchema).length(3),
});

export async function POST(request: Request) {
  try {
    let { topic } = await request.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    // 1. Fetch tweets using X API
    let tweetsText = '';
    let originalTweets: { id: string, text: string }[] = [];
    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (twitterBearerToken) {
      const twitterClient = new TwitterApi(twitterBearerToken);
      const readOnlyClient = twitterClient.readOnly;
      
      let isTweetUrl = false;
      let sourceTweetText = "";
      
      const tweetUrlMatch = topic.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
      if (tweetUrlMatch) {
        isTweetUrl = true;
        try {
          const tweetId = tweetUrlMatch[1];
          console.log(`[Tweet Fetch] Fetching source tweet ID: ${tweetId}`);
          const tweetData = await readOnlyClient.v2.singleTweet(tweetId, {
            'tweet.fields': ['text']
          });
          if (tweetData.data) {
            sourceTweetText = tweetData.data.text;
            console.log(`[Tweet Fetch] Success: ${sourceTweetText}`);
          }
        } catch (e) {
          console.warn('[Tweet Fetch] Failed to fetch source tweet:', e);
        }
      }

      // 1. Semantic Query Expansion: LLMを使って類義語・表記揺れを補完する
      let expandedQueryPart = `"${topic}"`;
      try {
        console.log(`[Query Expansion] Expanding topic/url: ${topic}`);
        const expansionSchema = z.object({
          core_topic: z.string().describe("検索の主軸となるトピック名（例：ベーシックインカム、生成AIなど）。元入力がキーワードの場合はそのまま、ツイート内容の場合はその中心テーマ。"),
          keywords: z.array(z.string()).min(1).max(4).describe("検索用キーワードの配列（主題トピックやその類義語など最大4つ）")
        });

        const promptText = isTweetUrl && sourceTweetText
          ? `以下のツイートが議論している中心的なテーマを1つ抽出し、それをX（旧Twitter）で検索して多数の意見を収集するためのキーワード（類義語や表記揺れを含めて最大4つ）を考えてください。
          
          ツイート内容: 「${sourceTweetText}」
          
          検索漏れを防ぐための関連キーワードを配列で出力してください。`
          : `「${topic}」というトピックについてX（旧Twitter）で検索します。
この言葉そのものだけでなく、表記揺れ、略称、あるいはほぼ同じ意味で使われる類義語を考えてください。
検索漏れを防ぐためのキーワードを、元の「${topic}」を必ず含めて最大4つ配列で出力してください。
例: "ベーシックインカム" -> ["ベーシックインカム", "BI", "最低保障", "給付金"]
例: "マイナ保険証" -> ["マイナ保険証", "マイナンバー保険証", "マイナンバーカード保険証"]`;

        const { object: expanded } = await generateObject({
          model: google('gemini-3.1-pro-preview'),
          schema: expansionSchema,
          prompt: promptText
        });

        if (expanded.core_topic) {
          topic = expanded.core_topic; // Reassign overall topic so the UI shows the core topic
        }

        if (expanded.keywords && expanded.keywords.length > 0) {
          // X API standard: ("A" OR "B" OR "C")
          const validKeywords = expanded.keywords.map((k: string) => `"${k.replace(/"/g, '')}"`);
          expandedQueryPart = `(${validKeywords.join(' OR ')})`;
          console.log(`[Query Expansion] Success: topic=${topic}, query=${expandedQueryPart}`);
        }
      } catch (expansionError) {
        console.warn('[Query Expansion] Failed, falling back to original topic:', expansionError);
        expandedQueryPart = `"${topic}"`;
      }

      // 2. APIクエリレベルでの除外: リツイートやリプライを除外、日本語のみに限定
      // （※Botはバズった投稿へのリプライとして湧くことが多いため、-is:reply が非常に有効です）
      const searchQuery = `${expandedQueryPart} -is:retweet -is:reply lang:ja`;
      
      const response = await readOnlyClient.v2.search(searchQuery, {
        max_results: 100, // 多めに取得して後でソートやフィルタリングをする
        'tweet.fields': ['text', 'lang', 'public_metrics'],
        expansions: ['referenced_tweets.id'],
      });
      
      let tweets = (response.data.data || []) as any[];
      const includedTweets = (response.includes?.tweets || response.data?.includes?.tweets || []) as any[];

      if (tweets.length > 0) {
        // 引用ツイートのテキストを結合する処理
        tweets = tweets.map(t => {
          if (t.referenced_tweets && t.referenced_tweets.length > 0) {
            const quotedRef = t.referenced_tweets.find((ref: any) => ref.type === 'quoted');
            if (quotedRef) {
              const quotedTweet = includedTweets.find((inc: any) => inc.id === quotedRef.id);
              if (quotedTweet) {
                // 引用文脈を追加し、一つのテキストとして処理させる
                t.text = `${t.text}\n\n（文脈としての引用ツイート：${quotedTweet.text}）`;
              }
            }
          }
          return t;
        });
        // 2. プログラム（ヒューリスティック）による除外ロジック
        const spamKeywords = ['プロフ見て', 'プロフにて', '固ツイ', '副業', '稼げる', 'http'];
        
        tweets = tweets.filter(t => {
          // 極端に短い投稿を除外
          if (t.text.length < 5) return false;
          
          // 日本語の文字（ひらがな・カタカナ・漢字）が含まれていない場合を除外
          if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(t.text)) return false;

          // アラビア文字など（ゾンビによく使われる）が含まれている場合を除外
          if (/[\u0600-\u06FF]/.test(t.text)) return false;

          // 明らかなスパムキーワードやURLを含むものを除外
          if (spamKeywords.some(kw => t.text.includes(kw))) return false;

          return true;
        });

        // 3. 論理密度の計算と総合スコアによるソート
        const logicalMarkers = [
          // 転換点（Pivot）/ 逆接
          '一方で', 'しかしながら', '別の側面では', 'とはいえ', 'それでも', '逆に', '反対に', '反面', 'だが', 'しかし',
          // 条件文・理由
          '仮に', 'とすれば', 'だとしたら', 'であれば', 'なぜなら', 'だからこそ', 'もし',
          // 結論・追加
          'したがって', 'そのため', 'ゆえに', 'さらに', '加えて'
        ];

        const calculateLogicDensity = (text: string) => {
          let hitCount = 0;
          for (const marker of logicalMarkers) {
            let pos = 0;
            while ((pos = text.indexOf(marker, pos)) !== -1) {
              hitCount++;
              pos += marker.length;
            }
          }
          // 総文字数を単語数の近似として使用
          return hitCount / (text.length || 1);
        };

        tweets.forEach((t: any) => {
          t.logicDensity = calculateLogicDensity(t.text);
          const metrics = t.public_metrics || {};
          const retweets = metrics.retweet_count || 0;
          const replies = metrics.reply_count || 0;
          const likes = metrics.like_count || 0;
          const impressions = metrics.impression_count || 0;
          const quotes = metrics.quote_count || 0;
          const bookmarks = metrics.bookmark_count || 0;
          
          // 各種エンゲージメント指標を合計（imp数は桁が大きいため0.1倍に調整）
          const totalEngagement = retweets + replies + likes + quotes + bookmarks + (impressions * 0.1);
          
          // スコア算出ロジック:
          // 拡散効果は大きすぎるため対数処理( log10(totalEngagement+1) )してスケールを抑える
          // density（0～0.1程度）を強調するため、(1 + density * 50) を掛ける
          t.analysisScore = Math.log10(totalEngagement + 1) * (1 + t.logicDensity * 50); 
        });

        // スコアで降順ソート
        tweets.sort((a, b) => b.analysisScore - a.analysisScore);

        // 有効な上位40件に絞る
        tweets = tweets.slice(0, 40);
        
        originalTweets = tweets;
        tweetsText = tweets.map((t: any, index: number) => `[投稿${index + 1}]: ${t.text}`).join('\n');
      } else {
        tweetsText = `トピック「${topic}」に関連する投稿が見つかりませんでした。一般的な知識に基づいて分析してください。`;
      }
    } else {
      // Fallback if X API token is not provided but we want to prototype
      console.warn("TWITTER_BEARER_TOKEN is not set. Proceeding without real tweets.");
      tweetsText = `（開発モード：実際のツイートは取得されていません。トピック「${topic}」に関する世間の一般的な対立意見を想定して分析してください。）`;
    }

    // 2. Load instructions from exview.md
    let systemPrompt = '';
    try {
      const exviewPath = path.join(process.cwd(), 'exview.md');
      systemPrompt = await fs.readFile(exviewPath, 'utf8');
    } catch (e) {
      console.error("Failed to read exview.md, using default prompt", e);
      systemPrompt = `あなたは言論空間の「構造」を読み解くデータサイエンティストです。ユーザーが与えたトピックやデータから、議論の支配的な「3つの主要な対立点（軸）」を抽出してください。`;
    }

    const fullPrompt = `${systemPrompt}
    
    # ターゲットトピック
    ${topic}
    
    # 抽出対象データ
    ${tweetsText}
    `;

    const { object } = await generateObject({
      model: google('gemini-3.1-pro-preview'),
      schema: analysisSchema,
      prompt: fullPrompt,
    });

    // 3. Post-processing: Calculate vector similarity to extract representative tweets for each pole
    let enhancedAxes = object.axes as any[];

    if (originalTweets.length > 0) {
      try {
        // Embed all tweets text
        const { embeddings: tweetEmbeddings } = await embedMany({
          model: google.textEmbeddingModel('gemini-embedding-001'),
          values: originalTweets.map(t => t.text)
        });

        // Store vectors for Topography
        const points = originalTweets.map((t, index) => ({
          id: t.id,
          text: t.text,
          embedding: tweetEmbeddings[index],
          metadata: {
            source: 'X' as const,
            parentId: topic
          }
        }));
        await appendVectors(points);
      } catch (embError) {
        console.error('Embedding error:', embError);
        // Fallback to normal axes if embedding fails
      }
    }

    // 4. Return results
    return NextResponse.json({ ...object, axes: enhancedAxes });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
