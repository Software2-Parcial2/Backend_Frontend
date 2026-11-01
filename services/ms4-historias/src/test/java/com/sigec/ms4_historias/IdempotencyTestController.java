package com.sigec.ms4_historias;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints solo de prueba para ejercitar el filtro de idempotencia. */
@RestController
@RequestMapping("/api/_test")
class IdempotencyTestController {

	static final AtomicInteger EXECUTIONS = new AtomicInteger();
	static volatile boolean failNext = false;

	@PostMapping("/slow")
	Map<String, Object> slow() throws InterruptedException {
		int n = EXECUTIONS.incrementAndGet();
		Thread.sleep(500);
		return Map.of("execution", n);
	}

	@PostMapping("/flaky")
	ResponseEntity<Map<String, Object>> flaky() {
		int n = EXECUTIONS.incrementAndGet();
		if (failNext) {
			failNext = false;
			return ResponseEntity.status(503).body(Map.of("error", "temporal"));
		}
		return ResponseEntity.ok(Map.of("execution", n));
	}
}
