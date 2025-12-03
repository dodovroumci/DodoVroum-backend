import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(createPaymentDto: CreatePaymentDto, userId: string) {
    return this.prisma.payment.create({
      data: {
        ...createPaymentDto,
        userId, // injecté ici, pas dans le DTO
      } as Prisma.PaymentUncheckedCreateInput,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.payment.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Paiement non trouvé');
    }

    return payment;
  }

  async findByUser(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    await this.findOne(id);

    return this.prisma.payment.update({
      where: { id },
      data: updatePaymentDto,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        booking: {
          include: {
            residence: true,
            vehicle: true,
            offer: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.payment.delete({
      where: { id },
    });
  }
}
