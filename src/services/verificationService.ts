import api from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LivenessChallenge {
  id: string;
  instruction: string;
  icon: string;
}

export interface ChallengeResult {
  id: string;
  passed: boolean;
}

export interface InitiateVerificationResponse {
  success: boolean;
  alreadyVerified?: boolean;
  challenges?: LivenessChallenge[];
  sessionId?: string;
  message: string;
}

export interface SubmitVerificationResponse {
  success: boolean;
  verified: boolean;
  message: string;
  user?: {
    _id: string;
    verificationStatus: 'pending' | 'verified' | 'rejected';
    verificationDate: string;
  };
}

export interface VerificationStatusResponse {
  success: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verificationDate: string | null;
  verificationAttempts: number;
  isVerified: boolean;
}

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Initiate verification — server returns random liveness challenges
 */
export const initiateVerification = async (): Promise<InitiateVerificationResponse> => {
  const res = await api.post('/verification/initiate');
  return res.data;
};

/**
 * Submit verification — send selfie + challenge results
 * @param selfieUri  Local URI of selfie captured from live camera
 * @param challengeResults  Array of { id, passed } results from ML Kit
 * @param sessionId  Session ID returned from initiateVerification
 */
export const submitVerification = async (
  selfieUri: string | null,
  challengeResults: ChallengeResult[],
  sessionId: string,
): Promise<SubmitVerificationResponse> => {
  const formData = new FormData();

  formData.append('sessionId', sessionId);
  formData.append('challengeResults', JSON.stringify(challengeResults));

  if (selfieUri) {
    formData.append('selfie', {
      uri: selfieUri,
      type: 'image/jpeg',
      name: `selfie-${Date.now()}.jpg`,
    } as any);
  }

  const res = await api.post('/verification/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

/**
 * Get current user's verification status
 */
export const getVerificationStatus = async (): Promise<VerificationStatusResponse> => {
  const res = await api.get('/verification/status');
  return res.data;
};

/**
 * ADMIN: List all users with verification info
 */
export const adminListVerifications = async (
  status?: 'pending' | 'verified' | 'rejected',
  page = 1,
) => {
  const params: any = { page };
  if (status) params.status = status;
  const res = await api.get('/verification/admin/list', { params });
  return res.data;
};

/**
 * ADMIN: Reset a user's verification status (force re-verify)
 */
export const adminResetVerification = async (userId: string) => {
  const res = await api.put(`/verification/admin/${userId}/reset`);
  return res.data;
};
