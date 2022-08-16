import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { fibonacci } from '@openfeature/fibonacci';
import { Client } from '@openfeature/openfeature-js';
import { OPENFEATURE_CLIENT } from '../constants';
import { lastValueFrom, map } from 'rxjs';

@Injectable()
export class FibonacciService {
  constructor(private readonly httpService: HttpService, @Inject(OPENFEATURE_CLIENT) private client: Client) {}

  async calculateFibonacci(num: number): Promise<{ result: number }> {
    const useRemoteFibService = await this.client.getBooleanValue('use-remote-fib-service', false);

    if (useRemoteFibService) {
      return lastValueFrom(
        this.httpService
          .get<{ result: number }>('http://localhost:30001/calculate', { params: { num } })
          .pipe(map((res) => res.data))
      );
    }

    return {
      result: await fibonacci(num),
    };
  }
}
