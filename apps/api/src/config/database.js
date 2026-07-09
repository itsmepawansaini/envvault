import mongoose from 'mongoose';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);

  if (!uri) {
    console.warn('MONGODB_URI is not set. API will start, but data routes require MongoDB.');
    return null;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: Number(
        process.env.MONGODB_TIMEOUT_MS || (process.env.NODE_ENV === 'production' ? 10000 : 2500)
      )
    });
    console.log('MongoDB connected for EnvVault API.');
    return mongoose.connection;
  } catch (error) {
    console.warn(`MongoDB connection skipped: ${error.message}`);
    return null;
  }
}
