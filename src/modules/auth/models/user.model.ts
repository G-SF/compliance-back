/**
 * User Model (Mongoose)
 *
 * Intentionally kept minimal — add profile fields as the product grows.
 * The password field is excluded from serialisation via `toJSON` transform.
 */

import { Schema, model, Document } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      // Never return the hashed password in API responses
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
    // Remove __v and hide password in all JSON outputs
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['password'];
        return ret;
      },
    },
  },
);

export const UserModel = model<IUser>('User', userSchema);
