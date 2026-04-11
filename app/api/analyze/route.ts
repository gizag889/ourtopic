import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject, embedMany, cosineSimilarity } from 'ai';
import { z } from 'zod';
import { TwitterApi } from 'twitter-api-v2';
import fs from 'fs/promises';
import path from 'path';

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
      
      const response = await readOnlyClient.v2.search(topic, {
        max_results: 20,
        'tweet.fields': ['text', 'lang'],
      });
      
      const tweets = response.data.data;
      if (tweets && tweets.length > 0) {
        originalTweets = tweets as any[];
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
