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
    const { topic } = await request.json();

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
      
      // 1. APIクエリレベルでの除外: リツイートやリプライを除外、日本語のみに限定
      // （※Botはバズった投稿へのリプライとして湧くことが多いため、-is:reply が非常に有効です）
      const searchQuery = `${topic} -is:retweet -is:reply lang:ja`;
      
      const response = await readOnlyClient.v2.search(searchQuery, {
        max_results: 100, // 多めに取得して後でソートやフィルタリングをする
        'tweet.fields': ['text', 'lang', 'public_metrics'],
      });
      
      let tweets = (response.data.data || []) as any[];

      if (tweets.length > 0) {
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
          const retweets = t.public_metrics?.retweet_count || 0;
          
          // スコア算出ロジック:
          // 拡散効果は大きすぎるため対数処理( log10(retweet+1) )してスケールを抑える
          // density（0～0.1程度）を強調するため、(1 + density * 50) を掛ける
          t.analysisScore = Math.log10(retweets + 1) * (1 + t.logicDensity * 50); 
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

        
        // Map over each generated axis
        enhancedAxes = await Promise.all(object.axes.map(async (axis) => {
          // Embed the pole labels
          const { embeddings: poleEmbeddings } = await embedMany({
            model: google.textEmbeddingModel('gemini-embedding-001'),
            values: axis.poles
          });

          let bestTweetId0 = originalTweets[0].id;
          let bestTweetId1 = originalTweets[0].id;
          let maxSim0 = -1;
          let maxSim1 = -1;

          // Variables for medoid clustering
          const group0: number[] = [];
          const group1: number[] = [];

          // Find the highest cosine similarity for both poles
          for (let i = 0; i < originalTweets.length; i++) {
            const sim0 = cosineSimilarity(poleEmbeddings[0], tweetEmbeddings[i]);
            const sim1 = cosineSimilarity(poleEmbeddings[1], tweetEmbeddings[i]);
            
            // For extreme opinions
            if (sim0 > maxSim0) {
              maxSim0 = sim0;
              bestTweetId0 = originalTweets[i].id;
            }
            if (sim1 > maxSim1) {
              maxSim1 = sim1;
              bestTweetId1 = originalTweets[i].id;
            }

            // Assign to closest cluster
            if (sim0 > sim1) {
              group0.push(i);
            } else {
              group1.push(i);
            }
          }

          // Helper to calculate centroid and find medoid
          const getMedoid = (groupIndices: number[]) => {
            if (groupIndices.length === 0) return originalTweets[0].id; // Fallback
            const dim = tweetEmbeddings[0].length;
            const centroid = new Array(dim).fill(0);
            
            // Calculate sum
            for (const idx of groupIndices) {
              for (let d = 0; d < dim; d++) {
                centroid[d] += tweetEmbeddings[idx][d];
              }
            }
            // Average
            for (let d = 0; d < dim; d++) {
              centroid[d] /= groupIndices.length;
            }

            // Find closest to centroid (Euclidean distance min)
            let minDist = Infinity;
            let medoidId = originalTweets[0].id;

            for (const idx of groupIndices) {
              let distSq = 0;
              for (let d = 0; d < dim; d++) {
                distSq += Math.pow(tweetEmbeddings[idx][d] - centroid[d], 2);
              }
              if (distSq < minDist) {
                minDist = distSq;
                medoidId = originalTweets[idx].id;
              }
            }
            return medoidId;
          };

          const medoidId0 = getMedoid(group0);
          const medoidId1 = getMedoid(group1);

          return {
            ...axis,
            representative_tweets: [bestTweetId0, bestTweetId1],
            medoid_tweets: [medoidId0, medoidId1]
          };
        }));
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
