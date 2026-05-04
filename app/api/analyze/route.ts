import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject, embed, embedMany, cosineSimilarity } from "ai";
import { z } from "zod";
import { TwitterApi } from "twitter-api-v2";
import fs from "fs/promises";
import path from "path";
import { appendVectors } from "@/lib/vector-store";

const coreAxiomSchema = z.object({
  statement: z.string().describe("公理の短い定義（例：個人情報は人格の一部である）"),
  why_it_is_core: z.string().describe("なぜこれを否定すると議論が崩壊するのかの解説"),
  vulnerability: z.number().min(0).max(1).describe("0.0〜1.0（0に近いほど疑いようのない公理、1に近いほど経験で変わりうる）"),
});

const deepAnalysisSchema = z.object({
  reasoning_process: z.object({
    abduction: z.string().describe("1. 逆行推論：両極の意見が「もっともらしい議論」として成立するための背景知識"),
    necessary_condition: z.string().describe("2. 必要条件：それが偽であれば対立自体が無意味になるような前提[X]"),
  }).describe("核心的公理を導き出すための思考プロセス（Chain of Thought）"),
  paradigm_name: z.string().describe("4. 理論負荷性の命名：この軸が世界をどう「〜として見ているか」を表すパラダイム名"),
  core_axioms: z.array(coreAxiomSchema).length(3).describe("3. 核心への純化：抽出した特定の出来事に依存しない普遍的で抽象的な公理3つ"),
  alternative_lens: z.string().describe("もし別の公理を採用した場合の、全く異なる解釈の提示"),
});

const axisSchema = z.object({
  id: z.string(),
  dimension_name: z.string().describe("軸の名前（例：ガバナンスの方向性）"),
  poles: z.array(z.string()).length(2).describe("両極のラベルA, B"),
  description: z
    .string()
    .describe("なぜこの軸がこの議論において重要なのかの解説"),
  bridge_hint: z
    .string()
    .describe("この軸における建設的な第三極（架け橋）を見つけるための着眼点"),
  deep_analysis: deepAnalysisSchema.describe("対立軸の背後に潜む「核心的公理」の深層分析"),
});

const analysisSchema = z.object({
  topic_summary: z.string().describe("トピックの簡潔な要約（100文字以内）"),
  axes: z.array(axisSchema).length(3),
});

export async function POST(request: Request) {
  try {
    let { topic } = await request.json();

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    // 1. Fetch tweets using X API
    let tweetsText = "";
    let originalTweets: { id: string; text: string }[] = [];
    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (twitterBearerToken) {
      const twitterClient = new TwitterApi(twitterBearerToken);
      const readOnlyClient = twitterClient.readOnly;

      let isTweetUrl = false;
      let sourceTweetText = "";

      const tweetUrlMatch = topic.match(
        /(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i,
      );
      if (tweetUrlMatch) {
        isTweetUrl = true;
        try {
          const tweetId = tweetUrlMatch[1];
          console.log(`[Tweet Fetch] Fetching source tweet ID: ${tweetId}`);
          const tweetData = await readOnlyClient.v2.singleTweet(tweetId, {
            "tweet.fields": ["text"],
          });
          if (tweetData.data) {
            sourceTweetText = tweetData.data.text;
            console.log(`[Tweet Fetch] Success: ${sourceTweetText}`);
          }
        } catch (e) {
          console.warn("[Tweet Fetch] Failed to fetch source tweet:", e);
        }
      }

      // 1. Semantic Query Expansion: LLMを使って類義語・表記揺れを補完する
      let expandedQueryPart = `"${topic}"`;
      try {
        console.log(`[Query Expansion] Expanding topic/url: ${topic}`);
        const expansionSchema = z.object({
          core_topic: z
            .string()
            .describe(
              "検索の主軸となるトピック名（例：ベーシックインカム、生成AIなど）。元入力がキーワードの場合はそのまま、ツイート内容の場合はその中心テーマ。",
            ),
          keywords: z
            .array(z.string())
            .min(1)
            .max(4)
            .describe(
              "検索用キーワードの配列（主題トピックやその類義語など最大4つ）",
            ),
        });

        const promptText =
          isTweetUrl && sourceTweetText
            ? `以下のツイートが議論している中心的なテーマを1つ抽出し、それをX（旧Twitter）で検索して多数の意見を収集するためのキーワード（類義語や表記揺れを含めて最大4つ）を考えてください。
          
          ツイート内容: 「${sourceTweetText}」
          
          検索漏れを防ぐための関連キーワードを配列で出力してください。`
            : `「${topic}」というトピックについてX（旧Twitter）で検索します。
この言葉そのものだけでなく、表記揺れ、略称、あるいはほぼ同じ意味で使われる類義語を考えてください。
検索漏れを防ぐためのキーワードを、元の「${topic}」を必ず含めて最大3つ配列で出力してください。
例: "ベーシックインカム" -> ["ベーシックインカム", "BI", "最低保障"]
例: "マイナ保険証" -> ["マイナ保険証", "マイナンバー保険証"]`;

        const { object: expanded } = await generateObject({
          model: google("gemini-3.1-pro-preview"),
          schema: expansionSchema,
          prompt: promptText,
        });

        if (expanded.core_topic) {
          topic = expanded.core_topic; // Reassign overall topic so the UI shows the core topic
        }

        if (expanded.keywords && expanded.keywords.length > 0) {
          // X API standard: ("A" OR "B" OR "C")
          const validKeywords = expanded.keywords.map(
            (k: string) => `"${k.replace(/"/g, "")}"`,
          );
          expandedQueryPart = `(${validKeywords.join(" OR ")})`;
          console.log(
            `[Query Expansion] Success: topic=${topic}, query=${expandedQueryPart}`,
          );
        }
      } catch (expansionError) {
        console.warn(
          "[Query Expansion] Failed, falling back to original topic:",
          expansionError,
        );
        expandedQueryPart = `"${topic}"`;
      }

      // 2. APIクエリレベルでの除外: リツイートやリプライを除外、日本語のみに限定
      // （※Botはバズった投稿へのリプライとして湧くことが多いため、-is:reply が非常に有効です）
      const searchQuery = `${expandedQueryPart} -is:retweet -is:reply lang:ja`;

      const response = await readOnlyClient.v2.search(searchQuery, {
        max_results: 100, // 多めに取得して後でソートやフィルタリングをする
        "tweet.fields": ["text", "lang", "public_metrics"],
        expansions: ["referenced_tweets.id"],
      });

      let tweets = (response.data.data || []) as any[];
      const includedTweets = (response.includes?.tweets ||
        response.data?.includes?.tweets ||
        []) as any[];

      if (tweets.length > 0) {
        // 引用ツイートのテキストを結合する処理
        tweets = tweets.map((t) => {
          if (t.referenced_tweets && t.referenced_tweets.length > 0) {
            const quotedRef = t.referenced_tweets.find(
              (ref: any) => ref.type === "quoted",
            );
            if (quotedRef) {
              const quotedTweet = includedTweets.find(
                (inc: any) => inc.id === quotedRef.id,
              );
              if (quotedTweet) {
                // 引用文脈を追加し、一つのテキストとして処理させる
                t.text = `${t.text}\n\n（文脈としての引用ツイート：${quotedTweet.text}）`;
              }
            }
          }
          return t;
        });
        // 2. プログラム（ヒューリスティック）による除外ロジック
        const spamKeywords = [
          "プロフ見て",
          "プロフにて",
          "固ツイ",
          "副業",
          "稼げる",
          "http",
        ];

        tweets = tweets.filter((t) => {
          // 極端に短い投稿を除外
          if (t.text.length < 5) return false;

          // 日本語の文字（ひらがな・カタカナ・漢字）が含まれていない場合を除外
          if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(t.text)) return false;

          // アラビア文字など（ゾンビによく使われる）が含まれている場合を除外
          if (/[\u0600-\u06FF]/.test(t.text)) return false;

          // 明らかなスパムキーワードやURLを含むものを除外
          if (spamKeywords.some((kw) => t.text.includes(kw))) return false;

          return true;
        });

        // 3. セマンティック・リランキングのためのベクトル化
        const contextText =
          isTweetUrl && sourceTweetText ? sourceTweetText : topic;
        let contextEmbedding: number[] | null = null;
        let tweetEmbeddings: number[][] = [];
        let useSimilarity = false;

        if (tweets.length > 0) {
          try {
            console.log(`[Semantic Reranking] Embedding context...`);
            const ctxResult = await embed({
              model: google.textEmbeddingModel("gemini-embedding-001"),
              value: contextText,
            });
            contextEmbedding = ctxResult.embedding;

            console.log(
              `[Semantic Reranking] Embedding ${tweets.length} candidate tweets...`,
            );
            const { embeddings } = await embedMany({
              model: google.textEmbeddingModel("gemini-embedding-001"),
              values: tweets.map((t) => t.text),
            });
            tweetEmbeddings = embeddings;
            useSimilarity = true;
          } catch (e) {
            console.warn(
              "[Semantic Reranking] Embedding failed, falling back to basic scoring:",
              e,
            );
          }
        }

        // 4. 論理密度の計算と総合スコアによるソート
        const logicalMarkers = [
          // 転換点（Pivot）/ 逆接
          "一方で",
          "しかしながら",
          "別の側面では",
          "とはいえ",
          "それでも",
          "逆に",
          "反対に",
          "反面",
          "だが",
          "しかし",
          // 条件文・理由
          "仮に",
          "とすれば",
          "だとしたら",
          "であれば",
          "なぜなら",
          "だからこそ",
          "もし",
          // 結論・追加
          "したがって",
          "そのため",
          "ゆえに",
          "さらに",
          "加えて",
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

        tweets.forEach((t: any, index: number) => {
          t.logicDensity = calculateLogicDensity(t.text);
          const metrics = t.public_metrics || {};
          const retweets = metrics.retweet_count || 0;
          const replies = metrics.reply_count || 0;
          const likes = metrics.like_count || 0;
          const impressions = metrics.impression_count || 0;
          const quotes = metrics.quote_count || 0;
          const bookmarks = metrics.bookmark_count || 0;

          // 各種エンゲージメント指標を合計（imp数は桁が大きいため0.1倍に調整）
          const totalEngagement =
            retweets + replies + likes + quotes + bookmarks + impressions * 0.1;

          let semanticMultiplier = 1;
          if (
            useSimilarity &&
            contextEmbedding &&
            tweetEmbeddings.length > index
          ) {
            const sim = cosineSimilarity(
              contextEmbedding,
              tweetEmbeddings[index],
            );
            // 類似度スコアを反映（マイナスは排除しつつ、差を際立たせるため2乗する）
            semanticMultiplier = Math.max(
              0.01,
              Math.pow(Math.max(0, sim), 2) * 5,
            );
          }

          // スコア算出ロジック:
          // 拡散効果は大きすぎるため対数処理( log10(totalEngagement+1) )してスケールを抑える
          // density（0～0.1程度）を強調するため、(1 + density * 50) を掛ける
          // 文脈類似度のMultiplierを掛け合わせて最終スコアとする
          t.analysisScore =
            Math.log10(totalEngagement + 1) *
            (1 + t.logicDensity * 50) *
            semanticMultiplier;
        });

        // スコアで降順ソート
        tweets.sort((a, b) => b.analysisScore - a.analysisScore);

        // 有効な上位40件に絞る
        tweets = tweets.slice(0, 40);

        originalTweets = tweets;
        tweetsText = tweets
          .map((t: any, index: number) => `[投稿${index + 1}]: ${t.text}`)
          .join("\n");
      } else {
        tweetsText = `トピック「${topic}」に関連する投稿が見つかりませんでした。一般的な知識に基づいて分析してください。`;
      }
    } else {
      // Fallback if X API token is not provided but we want to prototype
      console.warn(
        "TWITTER_BEARER_TOKEN is not set. Proceeding without real tweets.",
      );
      tweetsText = `（開発モード：実際のツイートは取得されていません。トピック「${topic}」に関する世間の一般的な対立意見を想定して分析してください。）`;
    }

    // 2. Load instructions from exview.md
    let systemPrompt = "";
    try {
      const exviewPath = path.join(process.cwd(), "exview.md");
      systemPrompt = await fs.readFile(exviewPath, "utf8");
    } catch (e) {
      console.error("Failed to read exview.md, using default prompt", e);
      systemPrompt = `あなたは言論空間の「構造」を読み解くデータサイエンティストです。ユーザーが与えたトピックやデータから、議論の支配的な「3つの主要な対立点（軸）」を抽出してください。`;
    }

    const fullPrompt = `${systemPrompt}
    
    # 深層分析（CORE AXIOMS）に関する特別指示
    あなたは科学哲学者であり、データの深層構造を分析するエンジニアです。ハンソンの「理論負荷性」とクワインの「信念の網」の理論に基づき、ユーザーが提示する対立軸の背後に潜む「核心的公理（CORE AXIOMS）」を特定してください。
    あなたの目的は、表層の言葉に惑わされず、その議論が「そもそも何を正しいと信じることで成立しているのか」という不動の前提を暴き出すことです。
    
    各「対立軸」について、以下の4つのステップで思考し、JSONの \`deep_analysis\` に結果を格納してください。
    
    1. **逆行推論（Abduction）:**
    この投稿群が「もっともらしい議論」として成立するためには、どのような背景知識が必要か？（\`reasoning_process.abduction\`へ）
    2. **必要条件の特定:**
    もし、[X]という前提が偽であるなら、この対立自体が無意味になるような[X]は何か？（\`reasoning_process.necessary_condition\`へ）
    3. **核心（CORE）への純化:**
    抽出した前提の中から、特定の出来事に依存しない、より普遍的で抽象的な「公理」を3つ選んでください。（\`core_axioms\`へ）
    4. **理論負荷性の命名:**
    この軸が世界をどう「〜として見ているか（Seeing-as）」を表現するパラダイム名（例：功利主義的レンズ、技術楽観主義など）を特定してください。（\`paradigm_name\`へ）
    
    # ターゲットトピック
    ${topic}
    
    # 抽出対象データ
    ${tweetsText}
    `;

    const { object } = await generateObject({
      model: google("gemini-3.1-pro-preview"),
      schema: analysisSchema,
      prompt: fullPrompt,
    });

    // 3. Post-processing: Calculate vector similarity to extract representative tweets for each pole
    let enhancedAxes = object.axes as any[];

    if (originalTweets.length > 0) {
      try {
        // Embed all tweets text
        const { embeddings: tweetEmbeddings } = await embedMany({
          model: google.textEmbeddingModel("gemini-embedding-001"),
          values: originalTweets.map((t) => t.text),
        });

        // Store vectors for Topography
        const points = originalTweets.map((t, index) => ({
          id: t.id,
          text: t.text,
          embedding: tweetEmbeddings[index],
          metadata: {
            source: "X" as const,
            parentId: topic,
          },
        }));
        await appendVectors(points);
      } catch (embError) {
        console.error("Embedding error:", embError);
        // Fallback to normal axes if embedding fails
      }
    }

    // 4. Return results
    return NextResponse.json({ ...object, axes: enhancedAxes });
  } catch (error: any) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
