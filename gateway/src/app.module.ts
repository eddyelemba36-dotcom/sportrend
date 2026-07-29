import { Module } from "@nestjs/common";
import { ApiModule } from "./modules/api/api.module";
import { WsModule } from "./modules/ws/ws.module";
import { ProxyModule } from "./modules/proxy/proxy.module";

@Module({
  imports: [ApiModule, WsModule, ProxyModule],
})
export class AppModule {}
