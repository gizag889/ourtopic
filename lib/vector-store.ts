import fs from 'fs/promises';
import path from 'path';

export type VectorDataPoint = {
  id: string;          // Chunk ID or Tweet ID
  text: string;        // Text content
  embedding: number[]; // Vector from embedding model
  metadata: {
    source: 'X' | 'Note';
    parentId: string;  // Topic string or document ID
  };
};

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'vectors.json');

export async function initVectorStore() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(FILE_PATH);
    } catch {
      await fs.writeFile(FILE_PATH, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Failed to initialize vector store:', error);
  }
}

export async function appendVectors(newPoints: VectorDataPoint[]) {
  try {
    await initVectorStore();
    const data = await fs.readFile(FILE_PATH, 'utf-8');
    const existingPoints: VectorDataPoint[] = JSON.parse(data);
    
    // Simple deduplication based on ID
    const pointMap = new Map<string, VectorDataPoint>();
    existingPoints.forEach(p => pointMap.set(p.id, p));
    newPoints.forEach(p => pointMap.set(p.id, p));

    const mergedPoints = Array.from(pointMap.values());
    await fs.writeFile(FILE_PATH, JSON.stringify(mergedPoints, null, 2));
  } catch (error) {
    console.error('Failed to append vectors:', error);
  }
}

export async function getAllVectors(): Promise<VectorDataPoint[]> {
  try {
    await initVectorStore();
    const data = await fs.readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read vectors:', error);
    return [];
  }
}

export async function clearVectors() {
  try {
    await initVectorStore();
    await fs.writeFile(FILE_PATH, JSON.stringify([]));
  } catch (error) {
    console.error('Failed to clear vectors:', error);
  }
}
