import { Controller, Get, Patch, Put, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Récupérer toutes les notifications de l\'utilisateur connecté' })
  @ApiQuery({ name: 'unread', required: false, description: 'Filtrer uniquement les notifications non lues' })
  @ApiResponse({ status: 200, description: 'Liste des notifications' })
  getNotifications(@Request() req, @Query('unread') unread?: string) {
    const isUnread = unread === 'true';
    if (isUnread) {
      return this.notificationsService.getUnreadNotifications(req.user.id);
    }
    return this.notificationsService.getUserNotifications(req.user.id);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Récupérer les notifications non lues' })
  @ApiResponse({ status: 200, description: 'Liste des notifications non lues' })
  getUnreadNotifications(@Request() req) {
    return this.notificationsService.getUnreadNotifications(req.user.id);
  }

  @Get('count')
  @ApiOperation({ summary: 'Compter les notifications non lues' })
  @ApiResponse({ status: 200, description: 'Nombre de notifications non lues' })
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiResponse({ status: 200, description: 'Notification marquée comme lue' })
  @ApiResponse({ status: 404, description: 'Notification non trouvée' })
  markAsRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue (PUT)' })
  @ApiResponse({ status: 200, description: 'Notification marquée comme lue' })
  @ApiResponse({ status: 404, description: 'Notification non trouvée' })
  markAsReadPut(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  @ApiResponse({ status: 200, description: 'Toutes les notifications ont été marquées comme lues' })
  markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une notification' })
  @ApiResponse({ status: 200, description: 'Notification supprimée' })
  @ApiResponse({ status: 404, description: 'Notification non trouvée' })
  deleteNotification(@Param('id') id: string, @Request() req) {
    return this.notificationsService.deleteNotification(id, req.user.id);
  }
}

