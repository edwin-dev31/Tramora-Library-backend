import { Module } from '@nestjs/common';
import { GoogleBooksService } from './google-books.service.js';

@Module({
  providers: [GoogleBooksService],
  exports: [GoogleBooksService],
})
export class GoogleBooksModule {}
