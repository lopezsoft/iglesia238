import { Injectable, PipeTransform } from '@nestjs/common';
import { NotFoundDomainException } from '../errors/domain.exception.js';

const POSITIVE_INT = /^[1-9]\d{0,9}$/;
const MAX_INT = 2_147_483_647;

/**
 * Path parameter that must be a positive integer id. Anything else answers 404: an id that cannot
 * exist is the same as one that does not.
 */
@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = POSITIVE_INT.test(value) ? Number(value) : Number.NaN;
    if (!Number.isInteger(id) || id > MAX_INT) {
      throw new NotFoundDomainException();
    }
    return id;
  }
}
