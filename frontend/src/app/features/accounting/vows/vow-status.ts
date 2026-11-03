import { BadgeTone } from '../../../shared/ui/status-badge.component';
import { VowPledgeStatus } from '../data/accounting.models';

export const VOW_STATUS_TONES: Readonly<Record<VowPledgeStatus, BadgeTone>> = {
  ACTIVE: 'info',
  FULFILLED: 'success',
  CANCELLED: 'neutral',
};
