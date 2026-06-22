import { Request, Response } from 'express';
import { authService } from './auth.service';

export class AuthController {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result, message: 'Login successful' });
  }

  async logout(req: Request, res: Response) {
    const { refreshToken } = req.body;
    await authService.logout(req.user!.userId, refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  }

  async refreshToken(req: Request, res: Response) {
    const refreshToken = req.body.refreshToken || req.body.refresh_token;
    const result = await authService.refreshToken(refreshToken);
    res.json({ success: true, data: result });
  }

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.json({ success: true, message: 'If that email exists, a password reset link has been sent.' });
  }

  async resetPassword(req: Request, res: Response) {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  }

  async changePassword(req: Request, res: Response) {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  }

  async getProfile(req: Request, res: Response) {
    const profile = await authService.getProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  }

  async updateProfile(req: Request, res: Response) {
    const { firstName, lastName, phone } = req.body;
    const profile = await authService.updateProfile(req.user!.userId, { firstName, lastName, phone });
    res.json({ success: true, data: profile, message: 'Profile updated successfully' });
  }
}

export const authController = new AuthController();
