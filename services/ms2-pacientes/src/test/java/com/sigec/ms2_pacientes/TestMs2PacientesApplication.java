package com.sigec.ms2_pacientes;

import org.springframework.boot.SpringApplication;

public class TestMs2PacientesApplication {

	public static void main(String[] args) {
		SpringApplication.from(Ms2PacientesApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
