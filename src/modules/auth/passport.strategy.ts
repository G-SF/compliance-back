/**
 * Passport Google OAuth 2.0 Strategy
 *
 * Authenticates via Google and normalises the profile into a plain object
 * that auth.controller.ts uses to call authService.googleAuth().
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../../config';

export function configurePassport(): void {
  if (!config.google.clientId || !config.google.clientSecret) {
    console.warn(
      '[Passport] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled.',
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value ?? null;

        if (!email) {
          return done(new Error('Google account has no email'), undefined);
        }

        const normalised = {
          googleId: profile.id,
          email,
          name: profile.displayName ?? null,
        };

        return done(null, normalised);
      },
    ),
  );

  // We use stateless JWT — no session serialisation needed
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));
}
