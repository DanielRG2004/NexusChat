module.exports = (io, pool) => {
  const users = new Map();

  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);

    // ===============================
    // USUARIO ONLINE
    // ===============================
    socket.on('user_online', async (userId) => {
      console.log(`✅ Usuario ${userId} conectado`);
      users.set(userId, socket.id);
      socket.userId = userId;

      io.emit('refresh_chats');

      const [pending] = await pool.execute(
        `SELECT m.id, m.emisor_id, m.conversacion_id
         FROM mensajes_estado_privada mep
         JOIN mensajes m ON m.id = mep.mensaje_id
         WHERE mep.usuario_id = ? 
         AND mep.estado = 'sent' 
         AND m.emisor_id != ?`,
        [userId, userId]
      );

      for (const msg of pending) {
        await pool.execute(
          `UPDATE mensajes_estado_privada 
           SET estado = 'delivered' 
           WHERE mensaje_id = ? AND usuario_id = ?`,
          [msg.id, userId]
        );

        io.emit('refresh_messages', {
          conversationId: msg.conversacion_id
        });

        const senderSocket = users.get(msg.emisor_id);
        if (senderSocket) {
          io.to(senderSocket).emit('message_status_updated', {
            messageId: msg.id,
            estado: 'delivered'
          });
        }
      }
    });

    // ===============================
    // TYPING
    // ===============================
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

    // ===============================
    // NUEVO MENSAJE
    // ===============================
    socket.on('new_message', async (data) => {
      try {
        const { messageId, senderId, receiverId, conversationId } = data;

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

      } catch (error) {
        console.error('Error en new_message:', error);
      }
    });

    // ===============================
    // MENSAJES LEÍDOS
    // ===============================
    socket.on('message_read', async (data) => {
      try {
        const { messageIds, userId, conversationId } = data;

        const placeholders = messageIds.map(() => '?').join(',');

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