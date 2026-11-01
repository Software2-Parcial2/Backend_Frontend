package com.sigec.ms4_historias;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class Ms4HistoriasApplicationTests {

	@Test
	void contextLoads() {
	}

}
