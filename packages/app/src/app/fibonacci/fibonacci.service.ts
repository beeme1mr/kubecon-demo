import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { fibonacci } from '@openfeature/fibonacci';
import { Client } from '@openfeature/openfeature-js';
import { OPENFEATURE_CLIENT } from '../constants';
import { lastValueFrom, map } from 'rxjs';

@Injectable()
export class FibonacciService {
  private readonly FIB3R_BASE_URL = process.env.FIB3R_BASE_URL || 'http://localhost:30001';

  constructor(private readonly httpService: HttpService, @Inject(OPENFEATURE_CLIENT) private client: Client) {}

  async calculateFibonacci(num: number): Promise<{ result: number }> {
    const useRemoteFibService = await this.client.getBooleanValue('use-remote-fib-service', false);

    if (useRemoteFibService) {
      return lastValueFrom(
        this.httpService
          .get<{ result: number }>(`${this.FIB3R_BASE_URL}/calculate`, {
            params: { num },
            auth: {
              username: process.env.FIB3R_USER || '',
              password: process.env.FIB3R_PASS || '',
            },
          })
          .pipe(map((res) => res.data))
      );
    }

    return {
      result: await fibonacci(num),
    };
  }
}
