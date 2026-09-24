import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';

@Entity({ name: 'subscriptions' })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  planId: string; // references plan id from config/plans.json

  @Column({ type: 'enum', enum: ['active','trialing','past_due','cancelled','expired'] })
  status: SubscriptionStatus;

  @Column({ nullable: true })
  providerCustomerId?: string; // e.g., Stripe customer ID

  @Column({ type: 'timestamptz', nullable: true })
  periodStart?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  periodEnd?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
