import { getDatabase } from "./config";

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  steps: string; // JSON string of AutomationStep[]
  createdAt: number;
  updatedAt: number;
}

export interface AutomationStep {
  action: string;
  params: Record<string, unknown>;
  description?: string;
}

const TABLE = "automation_scripts";

export async function getAllAutomationScripts(): Promise<AutomationScript[]> {
  try {
    const db = await getDatabase();
    const rows = await db.select<AutomationScript[]>(
      `SELECT * FROM ${TABLE} ORDER BY updated_at DESC`
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getAutomationScriptById(
  id: string
): Promise<AutomationScript | null> {
  try {
    const db = await getDatabase();
    const rows = await db.select<AutomationScript[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function createAutomationScript(
  script: Omit<AutomationScript, "createdAt" | "updatedAt">
): Promise<AutomationScript> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO ${TABLE} (id, name, description, steps, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [script.id, script.name, script.description, script.steps, now, now]
  );
  return { ...script, createdAt: now, updatedAt: now };
}

export async function updateAutomationScript(
  id: string,
  updates: Partial<Pick<AutomationScript, "name" | "description" | "steps">>
): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = $1");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${values.length + 1}`);
    values.push(updates.description);
  }
  if (updates.steps !== undefined) {
    fields.push(`steps = $${values.length + 1}`);
    values.push(updates.steps);
  }

  if (fields.length === 0) return;

  fields.push(`updated_at = $${values.length + 1}`);
  values.push(now);
  values.push(id);

  await db.execute(
    `UPDATE ${TABLE} SET ${fields.join(", ")} WHERE id = $${values.length}`
  );
}

export async function deleteAutomationScript(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
}
