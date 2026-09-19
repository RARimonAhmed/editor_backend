import { jobsService } from '../jobs/jobs.service.js';
import { creditsService } from '../credits/credits.service.js';
import { logger } from '../../core/logger.js';

export class WebhooksService {
  async handleStripeEvent(event: { type: string; data: { object: any } }) {
    logger.info({ eventType: event.type }, 'Handling Stripe billing webhook event');

    switch (event.type) {
      case 'checkout.session.completed':
      case 'invoice.payment_succeeded': {
        const customerEmail = event.data.object.customer_email;
        logger.info({ customerEmail }, 'Subscription payment succeeded, renewing user quota');
        break;
      }
      case 'customer.subscription.deleted': {
        logger.info('Subscription cancelled, reverting to free tier');
        break;
      }
      default:
        break;
    }
  }

  async handleWorkerJobCompletion(payload: {
    jobId: string;
    status: 'completed' | 'failed';
    progress: number;
    outputUrl?: string;
    errorMessage?: string;
  }) {
    logger.info({ payload }, 'Received media worker callback notification');

    await jobsService.updateJobProgress(
      payload.jobId,
      payload.progress,
      payload.status,
      payload.outputUrl ? { outputUrl: payload.outputUrl } : undefined
    );
  }
}

export const webhooksService = new WebhooksService();
