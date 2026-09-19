import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client.js';
import { NotFoundError, ForbiddenError } from '../../core/errors.js';
import { CreateProjectInput, UpdateProjectInput, TimelineData } from './projects.schemas.js';

export interface Project {
  id: string;
  userId: string;
  title: string;
  resolutionWidth: number;
  resolutionHeight: number;
  framerate: number;
  aspectRatio: string;
  timelineData: TimelineData;
  thumbnailUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const mockProjects = new Map<string, Project>();

export class ProjectsService {
  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const defaultTimeline: TimelineData = input.timelineData || {
      duration: 0,
      framerate: input.framerate || 30,
      tracks: [
        { id: 'track-v1', type: 'video', name: 'Main Video', muted: false, locked: false, clips: [] },
        { id: 'track-a1', type: 'audio', name: 'Main Audio', muted: false, locked: false, clips: [] },
      ],
      markers: [],
    };

    const project: Project = {
      id,
      userId,
      title: input.title,
      resolutionWidth: input.resolutionWidth || 1920,
      resolutionHeight: input.resolutionHeight || 1080,
      framerate: input.framerate || 30.0,
      aspectRatio: input.aspectRatio || '16:9',
      timelineData: defaultTimeline,
      thumbnailUrl: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    mockProjects.set(id, project);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO projects (id, user_id, title, resolution_width, resolution_height, framerate, aspect_ratio, timeline_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [
            project.id,
            project.userId,
            project.title,
            project.resolutionWidth,
            project.resolutionHeight,
            project.framerate,
            project.aspectRatio,
            JSON.stringify(project.timelineData),
          ]
        );
      }
    } catch {
      // fallback
    }

    return project;
  }

  async list(userId: string): Promise<Project[]> {
    const userProjects = Array.from(mockProjects.values()).filter((p) => p.userId === userId);
    return userProjects;
  }

  async getById(id: string, userId: string): Promise<Project> {
    const project = mockProjects.get(id);
    if (!project) {
      throw new NotFoundError(`Project not found: ${id}`);
    }

    if (project.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this project');
    }

    return project;
  }

  async update(id: string, userId: string, input: UpdateProjectInput): Promise<Project> {
    const project = await this.getById(id, userId);

    const updated: Project = {
      ...project,
      title: input.title !== undefined ? input.title : project.title,
      resolutionWidth: input.resolutionWidth !== undefined ? input.resolutionWidth : project.resolutionWidth,
      resolutionHeight: input.resolutionHeight !== undefined ? input.resolutionHeight : project.resolutionHeight,
      framerate: input.framerate !== undefined ? input.framerate : project.framerate,
      aspectRatio: input.aspectRatio !== undefined ? input.aspectRatio : project.aspectRatio,
      timelineData: input.timelineData !== undefined ? input.timelineData : project.timelineData,
      thumbnailUrl: input.thumbnailUrl !== undefined ? input.thumbnailUrl : project.thumbnailUrl,
      version: project.version + 1,
      updatedAt: new Date().toISOString(),
    };

    mockProjects.set(id, updated);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE projects
           SET title = $1, resolution_width = $2, resolution_height = $3, framerate = $4,
               aspect_ratio = $5, timeline_data = $6, version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND user_id = $8;`,
          [
            updated.title,
            updated.resolutionWidth,
            updated.resolutionHeight,
            updated.framerate,
            updated.aspectRatio,
            JSON.stringify(updated.timelineData),
            id,
            userId,
          ]
        );
      }
    } catch {
      // fallback
    }

    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getById(id, userId);
    mockProjects.delete(id);

    try {
      if (await db.isHealthy()) {
        await db.query('DELETE FROM projects WHERE id = $1 AND user_id = $2;', [id, userId]);
      }
    } catch {
      // fallback
    }
  }
}

export const projectsService = new ProjectsService();
