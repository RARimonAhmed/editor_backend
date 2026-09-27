import { FastifyInstance } from 'fastify';
import { presetController } from './preset.controller.js';

export async function presetRoutes(fastify: FastifyInstance) {
  fastify.get('/capabilities', presetController.getCapabilities.bind(presetController));
  fastify.get('/', presetController.listPresets.bind(presetController));
  fastify.get('/:id', presetController.getPresetById.bind(presetController));
}
