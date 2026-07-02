export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const authMock = {
  async login(email: string, password: string): Promise<AuthResponse> {
    await delay(1000);

    if (email.includes('fail')) {
      throw new Error('Invalid email or password');
    }

    if (password.length < 8) {
      throw new Error('Invalid email or password');
    }

    return {
      success: true,
      message: 'Login successful',
      user: {
        id: '1',
        name: email.split('@')[0],
        email,
      },
    };
  },

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    await delay(1200);

    if (email.includes('fail')) {
      throw new Error('Registration failed. Please try again.');
    }

    if (email.includes('exists')) {
      throw new Error('An account with this email already exists');
    }

    return {
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: '2',
        name,
        email,
      },
    };
  },

  async requestPasswordReset(email: string): Promise<AuthResponse> {
    await delay(1000);

    return {
      success: true,
      message: 'If an account with that email exists, we sent a password reset link.',
    };
  },

  async resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
    await delay(1000);

    if (!token || token.includes('invalid')) {
      throw new Error('Invalid or expired reset token');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    return {
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    };
  },

  async verifyEmail(token: string): Promise<AuthResponse> {
    await delay(1500);

    if (!token || token.includes('invalid')) {
      throw new Error('Invalid or expired verification token');
    }

    return {
      success: true,
      message: 'Email verified successfully! You can now log in.',
    };
  },
};
