import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  logger.info('[mongodb] connected');

  mongoose.connection.on('error', (error) => {
    logger.error('[mongodb] connection error', error.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('[mongodb] disconnected');
  });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('[mongodb] disconnected');
}