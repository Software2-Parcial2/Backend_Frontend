package com.sigec.ms4_historias;

import org.springframework.boot.SpringApplication;

public class TestMs4HistoriasApplication {

	public static void main(String[] args) {
		SpringApplication.from(Ms4HistoriasApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
