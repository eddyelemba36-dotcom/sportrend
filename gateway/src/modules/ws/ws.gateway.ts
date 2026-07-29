import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/ws",
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clients: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    console.log(`[WS] Client connected: ${client.id}`);
    this.clients.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] Client disconnected: ${client.id}`);
    this.clients.delete(client.id);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, matchIds: string[]) {
    const subs = this.clients.get(client.id) || new Set();
    matchIds.forEach((id) => {
      subs.add(id);
      client.join(`match:${id}`);
    });
    this.clients.set(client.id, subs);
    client.emit("subscribed", { matchIds: Array.from(subs) });
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(client: Socket, matchIds: string[]) {
    const subs = this.clients.get(client.id);
    if (subs) {
      matchIds.forEach((id) => {
        subs.delete(id);
        client.leave(`match:${id}`);
      });
    }
    client.emit("unsubscribed", { matchIds });
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, { event, data, timestamp: new Date().toISOString() });
  }

  broadcastMatchUpdate(matchId: string, data: any) {
    this.server.to(`match:${matchId}`).emit("match:update", data);
  }

  broadcastOddsUpdate(matchId: string, data: any) {
    this.server.to(`match:${matchId}`).emit("odds:update", { matchId, ...data });
  }

  broadcastLiveEvent(matchId: string, event: any) {
    this.server.to(`match:${matchId}`).emit("live:event", event);
  }
}
