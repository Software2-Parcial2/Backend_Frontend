package com.sigec.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8080/realms/sigec/protocol/openid-connect/certs")
class GatewayApplicationTests {

	@Test
	void contextLoads() {
	}
}
