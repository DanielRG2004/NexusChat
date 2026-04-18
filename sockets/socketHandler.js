module.exports = (io, pool) => {
  const users = new Map();

  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);

    socket.on('user_online', async (userId) => {
      console.log(`✅ Usuario ${userId} conectado`);
      users.set(userId, socket.id);
      socket.userId = userId;

      io.emit('refresh_chats');

      // Marcar como delivered mensajes privados pendientes
      const [pendingPriv] = await pool.execute(
        `SELECT m.id, m.emisor_id, m.conversacion_id
         FROM mensajes_estado_privada mep
         JOIN mensajes m ON m.id = mep.mensaje_id
         WHERE mep.usuario_id = ? 
         AND mep.estado = 'sent' 
         AND m.emisor_id != ?`,
        [userId, userId]
      );

      for (const msg of pendingPriv) {
        await pool.execute(
          `UPDATE mensajes_estado_privada 
           SET estado = 'delivered' 
           WHERE mensaje_id = ? AND usuario_id = ?`,
          [msg.id, userId]
        );
        io.emit('refresh_messages', { conversationId: msg.conversacion_id });
        const senderSocket = users.get(msg.emisor_id);
        if (senderSocket) {
          io.to(senderSocket).emit('message_status_updated', {
            messageId: msg.id,
            estado: 'delivered'
          });
        }
      }

      // Marcar como delivered mensajes de grupo pendientes
      const [pendingGroup] = await pool.execute(
        `SELECT m.id, m.emisor_id, m.conversacion_id
         FROM mensajes_estado_grupo meg
         JOIN mensajes m ON m.id = meg.mensaje_id
         WHERE meg.usuario_id = ? 
         AND meg.estado = 'sent' 
         AND m.emisor_id != ?`,
        [userId, userId]
      );

      for (const msg of pendingGroup) {
        await pool.execute(
          `UPDATE mensajes_estado_grupo 
           SET estado = 'delivered' 
           WHERE mensaje_id = ? AND usuario_id = ?`,
          [msg.id, userId]
        );
        io.emit('refresh_messages', { conversationId: msg.conversacion_id });
        // Notificar al emisor (opcional, en grupos no se suele notificar a cada emisor individualmente)
      }
    });

    socket.on('typing', (data) => {
      const { receiverId, userId, isTyping, conversationId } = data;
      const receiverSocket = users.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('typing_indicator', {
          conversationId,
          userId,
          isTyping
        });
      }
    });

    socket.on('new_message', async (data) => {
      try {
        const { messageId, senderId, receiverId, conversationId, isGroup } = data;

        if (!isGroup) {
          const receiverSocket = users.get(receiverId);
          if (receiverSocket) {
            io.to(receiverSocket).emit('receive_message', data);
            await pool.execute(
              `UPDATE mensajes_estado_privada 
               SET estado = 'delivered' 
               WHERE mensaje_id = ? AND usuario_id = ?`,
              [messageId, receiverId]
            );
          }
          io.emit('refresh_messages', { conversationId });
          io.emit('refresh_chats');
          const senderSocket = users.get(senderId);
          if (senderSocket) {
            io.to(senderSocket).emit('message_status_updated', {
              messageId,
              estado: 'delivered'
            });
          }
        } else {
          // Mensaje de grupo: notificar a todos los miembros conectados excepto al emisor
          const [members] = await pool.execute(
            `SELECT usuario_id FROM grupo_miembros WHERE grupo_id = (SELECT grupo_id FROM conversaciones WHERE id = ?)`,
            [conversationId]
          );
          members.forEach(member => {
            if (member.usuario_id !== senderId) {
              const memberSocket = users.get(member.usuario_id);
              if (memberSocket) {
                io.to(memberSocket).emit('receive_message', data);
              }
            }
          });
          io.emit('refresh_messages', { conversationId });
          io.emit('refresh_chats');
        }
      } catch (error) {
        console.error('Error en new_message:', error);
      }
    });

    socket.on('message_read', async (data) => {
      try {
        const { messageIds, userId, conversationId, isGroup } = data;
        const placeholders = messageIds.map(() => '?').join(',');

        if (!isGroup) {
          await pool.execute(
            `UPDATE mensajes_estado_privada 
             SET estado = 'read' 
             WHERE mensaje_id IN (${placeholders}) AND usuario_id = ?`,
            [...messageIds, userId]
          );
          io.emit('refresh_messages', { conversationId });
          io.emit('refresh_chats');

          const [senders] = await pool.execute(
            `SELECT DISTINCT emisor_id 
             FROM mensajes 
             WHERE id IN (${placeholders}) AND emisor_id != ?`,
            [...messageIds, userId]
          );
          for (const sender of senders) {
            const senderSocket = users.get(sender.emisor_id);
            if (senderSocket) {
              io.to(senderSocket).emit('message_read_status', {
                messageIds,
                userId,
                conversationId
              });
            }
          }
        } else {
          // Grupo: marcar como leídos para el usuario actual
          await pool.execute(
            `UPDATE mensajes_estado_grupo 
             SET estado = 'read' 
             WHERE mensaje_id IN (${placeholders}) AND usuario_id = ?`,
            [...messageIds, userId]
          );
          io.emit('refresh_messages', { conversationId });
          io.emit('refresh_chats');

          // Notificar a los emisores (opcional)
          const [senders] = await pool.execute(
            `SELECT DISTINCT emisor_id 
             FROM mensajes 
             WHERE id IN (${placeholders}) AND emisor_id != ?`,
            [...messageIds, userId]
          );
          for (const sender of senders) {
            const senderSocket = users.get(sender.emisor_id);
            if (senderSocket) {
              io.to(senderSocket).emit('group_message_read', {
                messageIds,
                userId,
                conversationId
              });
            }
          }
        }
      } catch (error) {
        console.error('Error en message_read:', error);
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        console.log(`❌ Usuario ${socket.userId} desconectado`);
        users.delete(socket.userId);
      }
    });
  });
};