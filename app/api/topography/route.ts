import { NextResponse } from 'next/server';
import { UMAP } from 'umap-js';
import { getAllVectors, clearVectors } from '@/lib/vector-store';

export async function GET() {
  try {
    const vectors = await getAllVectors();
    
    if (vectors.length === 0) {
      return NextResponse.json({ points: [] });
    }

    if (vectors.length < 2) {
      // Not enough points for UMAP
      const points = vectors.map((v, i) => ({
        id: v.id,
        text: v.text,
        source: v.metadata.source,
        parentId: v.metadata.parentId,
        x: i,
        y: i,
      }));
      return NextResponse.json({ points });
    }

    const embeddings = vectors.map(v => v.embedding);

    const nNeighbors = Math.min(15, vectors.length - 1);
    const umap = new UMAP({
      nComponents: 2,
      nEpochs: 400,
      nNeighbors: Math.max(2, nNeighbors),
    });

    const embeddingCoords = umap.fit(embeddings);

    const points = vectors.map((v, i) => ({
      id: v.id,
      text: v.text,
      source: v.metadata.source,
      parentId: v.metadata.parentId,
      x: embeddingCoords[i][0],
      y: embeddingCoords[i][1],
    }));

    return NextResponse.json({ points });
  } catch (error: any) {
    console.error('UMAP error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearVectors();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Clear error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
