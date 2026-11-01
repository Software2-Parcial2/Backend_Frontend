package com.sigec.ms2_pacientes;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class Ms2PacientesApplicationTests {

	@Test
	void contextLoads() {
	}

}
