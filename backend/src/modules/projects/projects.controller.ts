import { FastifyRequest, FastifyReply } from 'fastify';
import { projectsService } from './projects.service.js';
import {
  createProjectSchema,
  updateProjectSchema,
  autosaveProjectSchema,
  duplicateProjectSchema,
  listProjectsQuerySchema,
  renameProjectSchema,
  createBackupSchema,
  deleteProjectQuerySchema,
} from './projects.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class ProjectsController {
  // POST /v1/projects
  async create(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid project parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const project = await projectsService.create(userId, parseResult.data);

    reply.header('ETag', project.etag);
    reply.header('Last-Modified', new Date(project.updatedAt).toUTCString());

    return reply.status(201).send(
      createSuccessResponse(project, {
        projectVersion: project.version,
        etag: project.etag,
      })
    );
  }

  // GET /v1/projects
  async list(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = listProjectsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { projects, total } = await projectsService.list(userId, parseResult.data);

    return reply.status(200).send(
      createSuccessResponse(projects, {
        total,
        limit: parseResult.data.limit,
        offset: parseResult.data.offset,
        status: parseResult.data.status,
      })
    );
  }

  // GET /v1/projects/:id (Open project)
  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const project = await projectsService.getById(request.params.id, userId);

    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch && (ifNoneMatch === project.etag || ifNoneMatch === `"${project.version}"`)) {
      return reply.status(304).send();
    }

    reply.header('ETag', project.etag);
    reply.header('Last-Modified', new Date(project.updatedAt).toUTCString());

    return reply.status(200).send(
      createSuccessResponse(project, {
        projectVersion: project.version,
        etag: project.etag,
        updatedAt: project.updatedAt,
      })
    );
  }

  // PATCH /v1/projects/:id & PUT /v1/projects/:id (Update with concurrency check)
  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid update parameters', parseResult.error.format());
    }

    const ifMatchHeader = request.headers['if-match'];
    const userId = request.user!.userId;

    const updated = await projectsService.update(
      request.params.id,
      userId,
      parseResult.data,
      ifMatchHeader
    );

    reply.header('ETag', updated.etag);
    reply.header('Last-Modified', new Date(updated.updatedAt).toUTCString());

    return reply.status(200).send(
      createSuccessResponse(updated, {
        projectVersion: updated.version,
        etag: updated.etag,
        updatedAt: updated.updatedAt,
      })
    );
  }

  // PATCH /v1/projects/:id/rename
  async rename(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = renameProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid rename parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const updated = await projectsService.rename(
      request.params.id,
      userId,
      parseResult.data.title,
      parseResult.data.expectedVersion
    );

    reply.header('ETag', updated.etag);
    reply.header('Last-Modified', new Date(updated.updatedAt).toUTCString());

    return reply.status(200).send(
      createSuccessResponse(updated, {
        projectVersion: updated.version,
        etag: updated.etag,
        updatedAt: updated.updatedAt,
      })
    );
  }

  // POST /v1/projects/:id/autosave (Autosave sync endpoint)
  async autosave(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = autosaveProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid autosave parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const updated = await projectsService.autosave(request.params.id, userId, parseResult.data);

    reply.header('ETag', updated.etag);
    reply.header('Last-Modified', new Date(updated.updatedAt).toUTCString());

    return reply.status(200).send(
      createSuccessResponse(updated, {
        projectVersion: updated.version,
        etag: updated.etag,
        updatedAt: updated.updatedAt,
        autoSaved: true,
      })
    );
  }

  // POST /v1/projects/:id/duplicate
  async duplicate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = duplicateProjectSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      throw new ValidationError('Invalid duplicate parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const duplicated = await projectsService.duplicate(request.params.id, userId, parseResult.data);

    reply.header('ETag', duplicated.etag);
    return reply.status(201).send(createSuccessResponse(duplicated));
  }

  // POST /v1/projects/:id/archive
  async archive(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const archived = await projectsService.archive(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(archived));
  }

  // POST /v1/projects/:id/restore
  async restore(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const restored = await projectsService.restore(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(restored));
  }

  // DELETE /v1/projects/:id (Soft-delete or permanent delete via ?permanent=true)
  async delete(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { permanent?: string | boolean } }>,
    reply: FastifyReply
  ) {
    const userId = request.user!.userId;
    const isPermanent = request.query?.permanent === true || request.query?.permanent === 'true';
    await projectsService.delete(request.params.id, userId, isPermanent);
    return reply
      .status(200)
      .send(createSuccessResponse({ deleted: true, permanent: isPermanent, id: request.params.id }));
  }

  // POST /v1/projects/:id/permanent-delete
  async permanentDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    await projectsService.permanentDelete(request.params.id, userId);
    return reply
      .status(200)
      .send(createSuccessResponse({ deleted: true, permanent: true, id: request.params.id }));
  }

  // GET /v1/projects/:id/versions
  async getVersions(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const versions = await projectsService.getVersionHistory(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(versions, { total: versions.length }));
  }

  // POST /v1/projects/:id/snapshots (Create backup snapshot)
  async createSnapshot(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = createBackupSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      throw new ValidationError('Invalid backup snapshot parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const snapshot = await projectsService.createBackupSnapshot(
      request.params.id,
      userId,
      parseResult.data.name,
      parseResult.data.description
    );
    return reply.status(201).send(createSuccessResponse(snapshot));
  }

  // GET /v1/projects/:id/snapshots (List backup snapshots)
  async listSnapshots(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const snapshots = await projectsService.getBackupSnapshots(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(snapshots, { total: snapshots.length }));
  }
}

export const projectsController = new ProjectsController();

