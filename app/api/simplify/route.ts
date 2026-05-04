import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const coreAxiomSchema = z.object({
  statement: z.string(),
  why_it_is_core: z.string(),
  vulnerability: z.number().min(0).max(1),
});

const deepAnalysisSchema = z.object({
  reasoning_process: z.object({
    abduction: z.string(),
    necessary_condition: z.string(),
  }),
  paradigm_name: z.string(),
  core_axioms: z.array(coreAxiomSchema).length(3),
  alternative_lens: z.string(),
});

const axisSchema = z.object({
  id: z.string(),
  dimension_name: z.string(),
  poles: z.array(z.string()).length(2),
  description: z.string(),
  bridge_hint: z.string(),
  representative_texts: z.array(z.string()).optional(),
  deep_analysis: deepAnalysisSchema.optional(),
});

const analysisSchema = z.object({
  topic_summary: z.string(),
  axes: z.array(axisSchema),
});

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data || !data.axes) {
      return NextResponse.json({ error: "Analysis data is required" }, { status: 400 });
    }

    const systemPrompt = `あなたは優秀な翻訳者であり、サイエンスコミュニケーターです。
ユーザーから提供される「複雑で専門的な分析データ（JSON形式）」のデータ構造・オブジェクトキーを完全に維持したまま、
各項目のテキストを「中学生でも直感的に理解できる、やさしい日本語」に翻訳・意訳してください。

ルール：
1. 構造（idの文字列、配列の長さ）は一切変更しないでください。
2. 哲学的な用語（例：パラダイム、公理、逆行推論、必要条件）は、専門用語を避けて日常的な言葉（例：世界の見方、一番の根っこにある思い、背景にある事情、絶対に必要な条件など）に置き換えてください。
3. vulnerability などの数値は元のまま保持してください。
4. poles（対立する両極）や dimension_name, paradigm_name も、難しすぎる場合は少し噛み砕いた表現にしてください。
5. representative_texts は元の投稿テキストなので、翻訳せずそのまま保持してください。`;

    const { object } = await generateObject({
      model: google("gemini-3.1-pro-preview"),
      schema: analysisSchema,
      prompt: `${systemPrompt}\n\n入力データ:\n${JSON.stringify(data, null, 2)}`,
    });

    return NextResponse.json(object);
  } catch (error: any) {
    console.error("Simplify error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
