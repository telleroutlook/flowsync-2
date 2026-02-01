import { sql } from 'drizzle-orm';
import { projects, tasks } from '../db/schema';
import { seedProjects, seedTasks } from '../db/seed';
import { now } from './utils';
import { ensurePublicWorkspace } from './workspaceService';

export const ensureSeedData = async (db: ReturnType<typeof import('../db').getDb>) => {
  try {
    // Step 1: Ensure public workspace exists
    console.log('seed_step_1: ensuring public workspace');
    const publicWorkspace = await ensurePublicWorkspace(db);
    console.log('seed_step_1_complete: public workspace created', { id: publicWorkspace.id });

    // Step 2: Check if projects already exist
    const projectCountResult = await db.select({ count: sql<number>`count(*)` }).from(projects);
    const projectCount = projectCountResult[0]?.count ?? 0;
    console.log('seed_step_2: checking existing projects', { count: projectCount });

    // Step 3: Check if tasks already exist (skip seeding if already seeded)
    const taskCountResult = await db.select({ count: sql<number>`count(*)` }).from(tasks);
    const taskCount = taskCountResult[0]?.count ?? 0;
    console.log('seed_step_3: checking existing tasks', { count: taskCount });
    if (taskCount > 0) {
      console.log('seed_skip: tasks already exist, skipping seed');
      return;
    }

    // Step 4: Insert seed projects only if they don't exist
    console.log('seed_step_4: inserting seed projects');
    const timestamp = now();
    if (projectCount === 0) {
      await db.insert(projects).values(
        seedProjects.map((project) => ({
          id: project.id,
          workspaceId: publicWorkspace.id,
          name: project.name,
          description: project.description ?? null,
          icon: project.icon ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      );
      console.log('seed_step_4_complete: projects inserted', { count: seedProjects.length });
    } else {
      console.log('seed_step_4_skip: projects already exist');
    }

    // Step 5: Insert seed tasks one by one to avoid D1 batch limits
    console.log('seed_step_5: inserting seed tasks');
    let insertedCount = 0;
    for (const task of seedTasks) {
      try {
        await db.insert(tasks).values({
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          priority: task.priority,
          wbs: task.wbs ?? null,
          createdAt: task.createdAt,
          startDate: task.startDate ?? null,
          dueDate: task.dueDate ?? null,
          completion: task.completion ?? null,
          assignee: task.assignee ?? null,
          isMilestone: task.isMilestone ?? false,
          predecessors: task.predecessors ?? [],
          updatedAt: task.createdAt,
        });
        insertedCount++;
        if (insertedCount % 3 === 0) {
          console.log('seed_step_5_progress', { inserted: insertedCount, total: seedTasks.length });
        }
      } catch (error) {
        console.error('seed_step_5_error', { task: task.id, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    console.log('seed_step_5_complete: all tasks inserted', { count: insertedCount });
    console.log('seed_success: all seed data inserted successfully');
  } catch (error) {
    console.error('seed_error: failed to insert seed data', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};
