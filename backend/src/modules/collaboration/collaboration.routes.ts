import { FastifyInstance } from 'fastify';
import { collaborationController } from './collaboration.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function collaborationRoutes(fastify: FastifyInstance) {
  // Public route: Access shared project via link
  fastify.post(
    '/projects/shared/:token',
    {
      schema: {
        description: 'Access a shared project via secure share link token and optional password',
        tags: ['Project Collaboration'],
      },
    },
    collaborationController.accessSharedProject.bind(collaborationController)
  );

  // Authenticated routes
  fastify.register(async (authScope) => {
    authScope.addHook('preHandler', authenticate);

    authScope.post(
      '/projects/:id/collaborators',
      {
        schema: {
          description: 'Invite a new collaborator to the project with specified role (EDITOR, COMMENTER, VIEWER)',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.inviteCollaborator.bind(collaborationController)
    );

    authScope.get(
      '/projects/:id/collaborators',
      {
        schema: {
          description: 'List all collaborators and the project owner',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.listCollaborators.bind(collaborationController)
    );

    authScope.patch(
      '/projects/:id/collaborators/:userId',
      {
        schema: {
          description: 'Update collaborator role (e.g. promote from VIEWER to EDITOR)',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.updateRole.bind(collaborationController)
    );

    authScope.delete(
      '/projects/:id/collaborators/:userId',
      {
        schema: {
          description: 'Remove a collaborator from the project',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.removeCollaborator.bind(collaborationController)
    );

    authScope.post(
      '/projects/:id/collaborators/leave',
      {
        schema: {
          description: 'Voluntarily leave a project',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.leaveProject.bind(collaborationController)
    );

    // Share link endpoints
    authScope.post(
      '/projects/:id/share-link',
      {
        schema: {
          description: 'Create a shareable link for external reviewers with optional password & expiration',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.createShareLink.bind(collaborationController)
    );

    authScope.get(
      '/projects/:id/share-link',
      {
        schema: {
          description: 'Retrieve current active share link for the project',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.getShareLink.bind(collaborationController)
    );

    authScope.delete(
      '/projects/:id/share-link',
      {
        schema: {
          description: 'Revoke and disable active share link',
          tags: ['Project Collaboration'],
          security: [{ bearerAuth: [] }],
        },
      },
      collaborationController.revokeShareLink.bind(collaborationController)
    );
  });
}
