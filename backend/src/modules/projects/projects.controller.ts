import { FastifyRequest, FastifyReply } from 'fastify';
import { projectsService } from './projects.service.js';
import { createProjectSchema, updateProjectSchema } from './projects.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class ProjectsController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid project parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const project = await projectsService.create(userId, parseResult.data);
    return reply.status(201).send(createSuccessResponse(project));
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const list = await projectsService.list(userId);
    return reply.status(200).send(createSuccessResponse(list, { total: list.length }));
  }

  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const project = await projectsService.getById(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(project));
  }

  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid update parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const updated = await projectsService.update(request.params.id, userId, parseResult.data);
    return reply.status(200).send(createSuccessResponse(updated));
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    await projectsService.delete(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse({ deleted: true }));
  }
}

export const projectsController = new ProjectsController();
