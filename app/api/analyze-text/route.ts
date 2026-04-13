import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject, embedMany, cosineSimilarity } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { appendVectors } from '@/lib/vector-store';

// Zod schemas (Same as analyze/route.ts)
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
    const { topic, text } = await request.json();

    if (!topic || !text) {
      return NextResponse.json({ error: 'Topic and Text are required' }, { status: 400 });
    }

    // 1. Semantic Chunking Implementation
    // Segment text into sentences
    const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'sentence' });
    const sentences = Array.from(segmenter.segment(text)).map(s => s.segment.trim()).filter(s => s.length > 0);

    let chunks: string[] = [];

    if (sentences.length === 0) {
        return NextResponse.json({ error: 'Text does not contain valid sentences' }, { status: 400 });
    }

    if (sentences.length === 1) {
        chunks = [sentences[0]];
    } else {
        // Embed all sentences to find semantic boundaries
        const { embeddings: sentenceEmbeddings } = await embedMany({
            model: google.textEmbeddingModel('gemini-embedding-001'),
            values: sentences
        });

        // Similarity Threshold for breaking a chunk
        const SIMILARITY_THRESHOLD = 0.70;

        let currentChunk = sentences[0];

        for (let i = 0; i < sentences.length - 1; i++) {
            const sim = cosineSimilarity(sentenceEmbeddings[i], sentenceEmbeddings[i + 1]);
            
            // If the similarity drops below threshold, we found a semantic boundary
            if (sim < SIMILARITY_THRESHOLD) {
                chunks.push(currentChunk);
                currentChunk = sentences[i + 1];
            } else {
                currentChunk += ' ' + sentences[i + 1];
            }
        }
        chunks.push(currentChunk); // push the last chunk
    }

    // Prepare text representation for prompt
    const excerptsText = chunks.map((c, index) => `[テキストチャンク ${index + 1}]:\n${c}`).join('\n\n');

    // 2. Load instructions from exview.md
    let systemPrompt = '';
    try {
      const exviewPath = path.join(process.cwd(), 'exview.md');
      systemPrompt = await fs.readFile(exviewPath, 'utf8');
    } catch (e) {
      systemPrompt = `あなたは言論空間の「構造」を読み解くデータサイエンティストです。ユーザーが与えたトピックやデータから、議論の支配的な「3つの主要な対立点（軸）」を抽出してください。`;
    }

    const fullPrompt = `${systemPrompt}
    
    # ターゲットトピック
    ${topic}
    
    # 抽出対象データ
    ${excerptsText}
    `;

    // 3. Generate Analysis with Gemini
    const { object } = await generateObject({
      model: google('gemini-3.1-pro-preview'),
      schema: analysisSchema,
      prompt: fullPrompt,
    });

    // 4. Post-processing: Calculate vector similarity to extract representative chunks
    let enhancedAxes = object.axes as any[];

    if (chunks.length > 0) {
      try {
        // Embed all chunk texts
        const { embeddings: chunkEmbeddings } = await embedMany({
          model: google.textEmbeddingModel('gemini-embedding-001'),
          values: chunks
        });

        // Store vectors for Topography
        const points = chunks.map((c, index) => ({
          id: `note-chunk-${Date.now()}-${index}`, // Generate unique ID for the chunk
          text: c,
          embedding: chunkEmbeddings[index],
          metadata: {
            source: 'Note' as const,
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

          let bestChunkIndex0 = 0;
          let bestChunkIndex1 = 0;
          let maxSim0 = -1;
          let maxSim1 = -1;

          // Variables for medoid clustering
          const group0: number[] = [];
          const group1: number[] = [];

          // Find extremes and assign to groups
          for (let i = 0; i < chunks.length; i++) {
            const sim0 = cosineSimilarity(poleEmbeddings[0], chunkEmbeddings[i]);
            const sim1 = cosineSimilarity(poleEmbeddings[1], chunkEmbeddings[i]);
            
            if (sim0 > maxSim0) {
              maxSim0 = sim0;
              bestChunkIndex0 = i;
            }
            if (sim1 > maxSim1) {
              maxSim1 = sim1;
              bestChunkIndex1 = i;
            }

            if (sim0 > sim1) {
              group0.push(i);
            } else {
              group1.push(i);
            }
          }

          // Medoid calculation function
          const getMedoid = (groupIndices: number[]) => {
            if (groupIndices.length === 0) return 0; // Fallback
            const dim = chunkEmbeddings[0].length;
            const centroid = new Array(dim).fill(0);
            
            for (const idx of groupIndices) {
              for (let d = 0; d < dim; d++) {
                centroid[d] += chunkEmbeddings[idx][d];
              }
            }
            for (let d = 0; d < dim; d++) {
              centroid[d] /= groupIndices.length;
            }

            let minDist = Infinity;
            let medoidIdx = groupIndices[0];

            for (const idx of groupIndices) {
              let distSq = 0;
              for (let d = 0; d < dim; d++) {
                distSq += Math.pow(chunkEmbeddings[idx][d] - centroid[d], 2);
              }
              if (distSq < minDist) {
                minDist = distSq;
                medoidIdx = idx;
              }
            }
            return medoidIdx;
          };

          const medoidIdx0 = getMedoid(group0);
          const medoidIdx1 = getMedoid(group1);

          return {
            ...axis,
            representative_texts: [chunks[bestChunkIndex0], chunks[bestChunkIndex1]],
            medoid_texts: [chunks[medoidIdx0], chunks[medoidIdx1]]
          };
        }));
      } catch (embError) {
        console.error('Embedding error for chunks:', embError);
        // If embedding fails, return axes without representative texts
      }
    }

    return NextResponse.json({ ...object, axes: enhancedAxes });
  } catch (error: any) {
    console.error('Text Analysis error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
