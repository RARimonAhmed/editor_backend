import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../../database/client.js';
import {
  NotFoundError,
  ForbiddenError,
  ConcurrencyConflictError,
} from '../../core/errors.js';
import {
  CreateProjectInput,
  UpdateProjectInput,
  AutosaveProjectInput,
  DuplicateProjectInput,
  ListProjectsQuery,
  CanvasConfig,
  TimelineData,
  ProjectAsset,
  ProjectSettings,
} from './projects.schemas.js';

export interface ProjectMetadata {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: 'active' | 'archived' | 'deleted';
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProjectVersionRecord {
  id: string;
  projectId: string;
  versionNumber: number;
  changeSummary: string;
  isAutoSave: boolean;
  deviceName?: string;
  snapshotData: Record<string, any>;
  createdAt: string;
}

export interface ProjectDocument {
  id: string;
  userId: string;
  title: string;
  status: 'active' | 'archived' | 'deleted';
  version: number;
  projectVersion: number;
  createdAt: string;
  updatedAt: string;
  etag: string;

  metadata: ProjectMetadata;
  canvas: CanvasConfig;
  timeline: TimelineData;
  assets: ProjectAsset[];
  versions: {
    currentVersion: number;
    etag: string;
    versionToken: string;
    totalVersions: number;
    recentVersions: Array<Omit<ProjectVersionRecord, 'snapshotData'>>;
  };
  settings: ProjectSettings;

  // Backwards compatibility flat fields
  resolutionWidth: number;
  resolutionHeight: number;
  framerate: number;
  aspectRatio: string;
  timelineData: TimelineData;
  thumbnailUrl: string | null;

  // Flutter DTO compatibility fields
  schemaVersion?: number;
  resolution?: { width: number; height: number };
  frameRate?: number;
  durationMs?: number;
  tracks?: any[];
  markers?: any[];
}

export function enrichProjectForFlutter(doc: ProjectDocument): ProjectDocument {
  const tracks = (doc.timeline?.tracks || []).map((t: any) => ({
    ...t,
    isLocked: t.locked ?? t.isLocked ?? false,
    isMuted: t.muted ?? t.isMuted ?? false,
    clips: (t.clips || []).map((c: any) => ({
      ...c,
      timelineStartMs: Math.round((c.start || 0) * 1000),
      durationMs: Math.round((c.duration || 0) * 1000),
      sourceInPointMs: Math.round((c.sourceStart || 0) * 1000),
      assetId: c.mediaAssetId || c.assetId || c.id,
      isLocked: c.isLocked ?? false,
      isMuted: c.isMuted ?? false,
    })),
  }));

  const markers = (doc.timeline?.markers || []).map((m: any) => ({
    ...m,
    positionMs: Math.round((m.time || 0) * 1000),
  }));

  const width = doc.canvas?.resolutionWidth || doc.resolutionWidth || 1920;
  const height = doc.canvas?.resolutionHeight || doc.resolutionHeight || 1080;
  const frameRate = doc.canvas?.framerate || doc.framerate || 30;
  const durationMs = Math.round((doc.timeline?.duration || 0) * 1000);

  return {
    ...doc,
    schemaVersion: (doc as any).schemaVersion || 1,
    resolution: { width, height },
    frameRate,
    durationMs,
    tracks,
    markers,
  };
}

// In-memory repositories for test/mock resilience
export const mockProjects = new Map<string, ProjectDocument>();
const mockVersionHistory = new Map<string, ProjectVersionRecord[]>();

export class ProjectsService {
  // ============================================================================
  // ETAG & VERSION TOKEN COMPUTATION
  // ============================================================================
  private computeETag(projectId: string, version: number, updatedAt: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${projectId}:v${version}:${updatedAt}`)
      .digest('hex')
      .slice(0, 16);
    return `W/"${version}-${hash}"`;
  }

  private computeVersionToken(version: number, updatedAt: string): string {
    return `v${version}_${new Date(updatedAt).getTime()}`;
  }

  // ============================================================================
  // CREATE PROJECT
  // ============================================================================
  async create(userId: string, input: CreateProjectInput): Promise<ProjectDocument> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const canvas: CanvasConfig = input.canvas || {
      resolutionWidth: input.resolutionWidth || 1920,
      resolutionHeight: input.resolutionHeight || 1080,
      framerate: input.framerate || 30.0,
      aspectRatio: input.aspectRatio || '16:9',
      colorSpace: 'rec709',
      backgroundColor: '#000000',
    };

    const defaultTimeline: TimelineData = input.timeline || input.timelineData || {
      duration: 0,
      framerate: canvas.framerate,
      tracks: [
        { id: 'track-v1', type: 'video', name: 'Main Video', muted: false, locked: false, clips: [] },
        { id: 'track-a1', type: 'audio', name: 'Main Audio', muted: false, locked: false, clips: [] },
      ],
      markers: [],
    };

    const assets: ProjectAsset[] = input.assets || [];

    const settings: ProjectSettings = input.settings || {
      autoSaveIntervalSeconds: 30,
      snapToGrid: true,
      rippleEditing: false,
      proxyEnabled: true,
      defaultAudioGain: 0,
    };

    const metadata: ProjectMetadata = {
      id,
      userId,
      title: input.title,
      description: input.description || null,
      status: 'active',
      thumbnailUrl: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const versionNumber = 1;
    const etag = this.computeETag(id, versionNumber, now);
    const versionToken = this.computeVersionToken(versionNumber, now);

    const initialVersionRecord: ProjectVersionRecord = {
      id: uuidv4(),
      projectId: id,
      versionNumber,
      changeSummary: 'Initial project creation',
      isAutoSave: false,
      deviceName: 'Initial Client',
      snapshotData: { canvas, timeline: defaultTimeline, assets, settings },
      createdAt: now,
    };

    mockVersionHistory.set(id, [initialVersionRecord]);

    const project: ProjectDocument = {
      id,
      userId,
      title: input.title,
      status: 'active',
      version: versionNumber,
      projectVersion: versionNumber,
      createdAt: now,
      updatedAt: now,
      etag,
      metadata,
      canvas,
      timeline: defaultTimeline,
      assets,
      versions: {
        currentVersion: versionNumber,
        etag,
        versionToken,
        totalVersions: 1,
        recentVersions: [
          {
            id: initialVersionRecord.id,
            projectId: id,
            versionNumber: initialVersionRecord.versionNumber,
            changeSummary: initialVersionRecord.changeSummary,
            isAutoSave: initialVersionRecord.isAutoSave,
            deviceName: initialVersionRecord.deviceName,
            createdAt: initialVersionRecord.createdAt,
          },
        ],
      },
      settings,
      // Flat backwards-compat fields
      resolutionWidth: canvas.resolutionWidth,
      resolutionHeight: canvas.resolutionHeight,
      framerate: canvas.framerate,
      aspectRatio: canvas.aspectRatio,
      timelineData: defaultTimeline,
      thumbnailUrl: null,
    };

    mockProjects.set(id, project);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO projects (
            id, owner_id, title, description, resolution_width, resolution_height,
            framerate, aspect_ratio, color_space, version_number, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
          [
            id,
            userId,
            project.title,
            project.metadata.description,
            canvas.resolutionWidth,
            canvas.resolutionHeight,
            canvas.framerate,
            canvas.aspectRatio,
            canvas.colorSpace,
            versionNumber,
            'active',
          ]
        );
      }
    } catch {
      // fallback
    }

    return enrichProjectForFlutter(project);
  }

  // ============================================================================
  // OPEN / GET BY ID
  // ============================================================================
  async getById(id: string, userId: string): Promise<ProjectDocument> {
    const project = mockProjects.get(id);
    if (!project) {
      throw new NotFoundError(`Project not found: ${id}`);
    }

    if (project.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this project');
    }

    return enrichProjectForFlutter(project);
  }

  // ============================================================================
  // UPDATE (WITH OPTIMISTIC CONCURRENCY CHECK)
  // ============================================================================
  async update(
    id: string,
    userId: string,
    input: UpdateProjectInput,
    ifMatchHeader?: string
  ): Promise<ProjectDocument> {
    const project = await this.getById(id, userId);

    // 1. Concurrency Check
    this.verifyConcurrency(project, input.expectedVersion ?? input.baseVersion, ifMatchHeader);

    const now = new Date().toISOString();
    const newVersionNumber = project.version + 1;

    // Update canvas
    const newCanvas: CanvasConfig = {
      ...project.canvas,
      ...(input.canvas || {}),
      resolutionWidth: input.resolutionWidth ?? input.canvas?.resolutionWidth ?? project.canvas.resolutionWidth,
      resolutionHeight: input.resolutionHeight ?? input.canvas?.resolutionHeight ?? project.canvas.resolutionHeight,
      framerate: input.framerate ?? input.canvas?.framerate ?? project.canvas.framerate,
      aspectRatio: input.aspectRatio ?? input.canvas?.aspectRatio ?? project.canvas.aspectRatio,
    };

    // Update timeline
    const newTimeline: TimelineData = input.timeline ?? input.timelineData ?? project.timeline;

    // Update assets
    const newAssets: ProjectAsset[] = input.assets ?? project.assets;

    // Update settings
    const newSettings: ProjectSettings = {
      ...project.settings,
      ...(input.settings || {}),
    };

    const newTitle = input.title ?? project.title;
    const newDescription = input.description !== undefined ? input.description : project.metadata.description;
    const newStatus = input.status ?? project.status;
    const newThumbnail = input.thumbnailUrl !== undefined ? input.thumbnailUrl : project.thumbnailUrl;

    const newETag = this.computeETag(id, newVersionNumber, now);
    const newVersionToken = this.computeVersionToken(newVersionNumber, now);

    // Record immutable version
    const versionRecord: ProjectVersionRecord = {
      id: uuidv4(),
      projectId: id,
      versionNumber: newVersionNumber,
      changeSummary: input.title && input.title !== project.title ? `Renamed to ${input.title}` : 'Project modified',
      isAutoSave: false,
      deviceName: 'Web/Desktop Client',
      snapshotData: { canvas: newCanvas, timeline: newTimeline, assets: newAssets, settings: newSettings },
      createdAt: now,
    };

    const history = mockVersionHistory.get(id) || [];
    history.push(versionRecord);
    mockVersionHistory.set(id, history);

    const updatedProject: ProjectDocument = {
      ...project,
      title: newTitle,
      status: newStatus,
      version: newVersionNumber,
      projectVersion: newVersionNumber,
      updatedAt: now,
      etag: newETag,
      metadata: {
        ...project.metadata,
        title: newTitle,
        description: newDescription,
        status: newStatus,
        thumbnailUrl: newThumbnail,
        updatedAt: now,
      },
      canvas: newCanvas,
      timeline: newTimeline,
      assets: newAssets,
      settings: newSettings,
      versions: {
        currentVersion: newVersionNumber,
        etag: newETag,
        versionToken: newVersionToken,
        totalVersions: history.length,
        recentVersions: history.slice(-10).map((v) => ({
          id: v.id,
          projectId: v.projectId,
          versionNumber: v.versionNumber,
          changeSummary: v.changeSummary,
          isAutoSave: v.isAutoSave,
          deviceName: v.deviceName,
          createdAt: v.createdAt,
        })),
      },
      // Flat backwards-compat fields
      resolutionWidth: newCanvas.resolutionWidth,
      resolutionHeight: newCanvas.resolutionHeight,
      framerate: newCanvas.framerate,
      aspectRatio: newCanvas.aspectRatio,
      timelineData: newTimeline,
      thumbnailUrl: newThumbnail,
    };

    mockProjects.set(id, updatedProject);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE projects
           SET title = $1, description = $2, resolution_width = $3, resolution_height = $4,
               framerate = $5, aspect_ratio = $6, version_number = $7, status = $8,
               thumbnail_url = $9, updated_at = CURRENT_TIMESTAMP
           WHERE id = $10 AND owner_id = $11;`,
          [
            newTitle,
            newDescription,
            newCanvas.resolutionWidth,
            newCanvas.resolutionHeight,
            newCanvas.framerate,
            newCanvas.aspectRatio,
            newVersionNumber,
            newStatus,
            newThumbnail,
            id,
            userId,
          ]
        );
      }
    } catch {
      // fallback
    }

    return enrichProjectForFlutter(updatedProject);
  }

  // ============================================================================
  // AUTOSAVE SYNC (NON-DESTRUCTIVE CONCURRENCY PROTECTED)
  // ============================================================================
  async autosave(id: string, userId: string, input: AutosaveProjectInput): Promise<ProjectDocument> {
    const project = await this.getById(id, userId);

    // Concurrency Check: must match baseVersion
    this.verifyConcurrency(project, input.baseVersion);

    const now = new Date().toISOString();
    const newVersionNumber = project.version + 1;
    const deviceName = input.device?.deviceName || input.device?.deviceType || 'Background Autosave';

    const newCanvas: CanvasConfig = {
      ...project.canvas,
      ...(input.canvas || {}),
    };

    const newTimeline: TimelineData = input.timeline ?? input.timelineData ?? project.timeline;
    const newAssets: ProjectAsset[] = input.assets ?? project.assets;
    const newSettings: ProjectSettings = {
      ...project.settings,
      ...(input.settings || {}),
    };

    const newETag = this.computeETag(id, newVersionNumber, now);
    const newVersionToken = this.computeVersionToken(newVersionNumber, now);

    const autoSaveRecord: ProjectVersionRecord = {
      id: uuidv4(),
      projectId: id,
      versionNumber: newVersionNumber,
      changeSummary: input.changeSummary || `Autosave from ${deviceName}`,
      isAutoSave: true,
      deviceName,
      snapshotData: { canvas: newCanvas, timeline: newTimeline, assets: newAssets, settings: newSettings },
      createdAt: now,
    };

    const history = mockVersionHistory.get(id) || [];
    history.push(autoSaveRecord);
    mockVersionHistory.set(id, history);

    const updatedProject: ProjectDocument = {
      ...project,
      version: newVersionNumber,
      projectVersion: newVersionNumber,
      updatedAt: now,
      etag: newETag,
      metadata: {
        ...project.metadata,
        updatedAt: now,
      },
      canvas: newCanvas,
      timeline: newTimeline,
      assets: newAssets,
      settings: newSettings,
      versions: {
        currentVersion: newVersionNumber,
        etag: newETag,
        versionToken: newVersionToken,
        totalVersions: history.length,
        recentVersions: history.slice(-10).map((v) => ({
          id: v.id,
          projectId: v.projectId,
          versionNumber: v.versionNumber,
          changeSummary: v.changeSummary,
          isAutoSave: v.isAutoSave,
          deviceName: v.deviceName,
          createdAt: v.createdAt,
        })),
      },
      timelineData: newTimeline,
    };

    mockProjects.set(id, updatedProject);
    return enrichProjectForFlutter(updatedProject);
  }

  // ============================================================================
  // DUPLICATE PROJECT
  // ============================================================================
  async duplicate(id: string, userId: string, input: DuplicateProjectInput): Promise<ProjectDocument> {
    const original = await this.getById(id, userId);

    const duplicateTitle = input.newTitle?.trim() || `Copy of ${original.title}`;

    return this.create(userId, {
      title: duplicateTitle,
      description: original.metadata.description || undefined,
      canvas: { ...original.canvas },
      timeline: JSON.parse(JSON.stringify(original.timeline)),
      assets: JSON.parse(JSON.stringify(original.assets)),
      settings: { ...original.settings },
    });
  }

  // ============================================================================
  // ARCHIVE PROJECT
  // ============================================================================
  async archive(id: string, userId: string): Promise<ProjectDocument> {
    return this.update(id, userId, { status: 'archived' });
  }

  // ============================================================================
  // SOFT-DELETE PROJECT
  // ============================================================================
  async delete(id: string, userId: string): Promise<void> {
    const project = await this.getById(id, userId);
    const now = new Date().toISOString();

    project.status = 'deleted';
    project.metadata.status = 'deleted';
    project.metadata.deletedAt = now;
    project.updatedAt = now;

    mockProjects.set(id, project);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE projects
           SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND owner_id = $2;`,
          [id, userId]
        );
      }
    } catch {
      // fallback
    }
  }

  // ============================================================================
  // RESTORE PROJECT
  // ============================================================================
  async restore(id: string, userId: string): Promise<ProjectDocument> {
    const project = mockProjects.get(id);
    if (!project) {
      throw new NotFoundError(`Project not found: ${id}`);
    }

    if (project.userId !== userId) {
      throw new ForbiddenError('You do not have permission to restore this project');
    }

    const now = new Date().toISOString();
    project.status = 'active';
    project.metadata.status = 'active';
    project.metadata.deletedAt = null;
    project.updatedAt = now;

    mockProjects.set(id, project);
    return project;
  }

  // ============================================================================
  // LIST & SEARCH PROJECTS
  // ============================================================================
  async list(
    userId: string,
    query: ListProjectsQuery = { status: 'active', limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' }
  ): Promise<{ projects: ProjectDocument[]; total: number }> {
    let userProjects = Array.from(mockProjects.values()).filter((p) => p.userId === userId);

    // 1. Status Filter
    if (query.status !== 'all') {
      userProjects = userProjects.filter((p) => p.status === query.status);
    }

    // 2. Search Term Filter
    const searchTerm = (query.search || query.q || '').trim().toLowerCase();
    if (searchTerm.length > 0) {
      userProjects = userProjects.filter((p) => {
        const titleMatch = p.title.toLowerCase().includes(searchTerm);
        const descMatch = p.metadata.description?.toLowerCase().includes(searchTerm);
        return titleMatch || Boolean(descMatch);
      });
    }

    const total = userProjects.length;

    // 3. Sorting
    userProjects.sort((a, b) => {
      let fieldA: string | number = a.updatedAt;
      let fieldB: string | number = b.updatedAt;

      if (query.sortBy === 'createdAt') {
        fieldA = a.createdAt;
        fieldB = b.createdAt;
      } else if (query.sortBy === 'title') {
        fieldA = a.title.toLowerCase();
        fieldB = b.title.toLowerCase();
      }

      if (query.sortOrder === 'asc') {
        return fieldA > fieldB ? 1 : -1;
      }
      return fieldA < fieldB ? 1 : -1;
    });

    // 4. Pagination
    const paginated = userProjects.slice(query.offset, query.offset + query.limit);

    return {
      projects: paginated.map(enrichProjectForFlutter),
      total,
    };
  }

  // ============================================================================
  // VERSION HISTORY
  // ============================================================================
  async getVersionHistory(id: string, userId: string): Promise<ProjectVersionRecord[]> {
    await this.getById(id, userId);
    return mockVersionHistory.get(id) || [];
  }

  // ============================================================================
  // HELPER: CONCURRENCY CHECK
  // ============================================================================
  private verifyConcurrency(project: ProjectDocument, expectedVersion?: number, ifMatchHeader?: string) {
    const history = mockVersionHistory.get(project.id) || [];
    const latestVersion = history[history.length - 1];
    const conflictingDevice = latestVersion?.deviceName || 'Another Device';

    // 1. Check If-Match header if provided
    if (ifMatchHeader) {
      const sanitizedIfMatch = ifMatchHeader.replace(/^W\//, '').replace(/"/g, '').trim();
      const sanitizedETag = project.etag.replace(/^W\//, '').replace(/"/g, '').trim();

      // If-Match could also be an explicit integer like "2"
      const parsedIfMatchVersion = parseInt(sanitizedIfMatch, 10);
      if (!isNaN(parsedIfMatchVersion)) {
        if (project.version !== parsedIfMatchVersion) {
          throw new ConcurrencyConflictError(
            `Conflict: Project was modified by ${conflictingDevice}. Server version is ${project.version}, but client specified version ${parsedIfMatchVersion}.`,
            {
              currentVersion: project.version,
              expectedVersion: parsedIfMatchVersion,
              serverUpdatedAt: project.updatedAt,
              serverETag: project.etag,
              conflictingDevice,
            }
          );
        }
      } else if (sanitizedIfMatch !== '*' && sanitizedIfMatch !== sanitizedETag) {
        throw new ConcurrencyConflictError(
          `Conflict: Project was modified by ${conflictingDevice}. ETag mismatch.`,
          {
            currentVersion: project.version,
            serverUpdatedAt: project.updatedAt,
            serverETag: project.etag,
            conflictingDevice,
          }
        );
      }
    }

    // 2. Check explicit expectedVersion/baseVersion parameter
    if (expectedVersion !== undefined && project.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Conflict: Project was modified by ${conflictingDevice}. Cloud sync paused to prevent overwriting newer work (server version: ${project.version}, expected: ${expectedVersion}).`,
        {
          currentVersion: project.version,
          expectedVersion,
          serverUpdatedAt: project.updatedAt,
          serverETag: project.etag,
          conflictingDevice,
        }
      );
    }
  }

  // ============================================================================
  // ADD ASSET TO PROJECT ASSET REGISTRY
  // ============================================================================
  async addAsset(projectId: string, userId: string, asset: ProjectAsset): Promise<ProjectDocument> {
    const project = await this.getById(projectId, userId);
    const existingAssets = project.assets || [];
    const updatedAssets = [...existingAssets.filter((a) => a.id !== asset.id), asset];
    return this.update(projectId, userId, { assets: updatedAssets });
  }
}

export const projectsService = new ProjectsService();


