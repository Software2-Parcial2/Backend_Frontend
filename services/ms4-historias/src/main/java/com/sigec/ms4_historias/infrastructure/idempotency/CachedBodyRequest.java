package com.sigec.ms4_historias.infrastructure.idempotency;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

/** Peticion cuyo cuerpo ya se leyo (para calcular la huella) y se puede volver a leer. */
class CachedBodyRequest extends HttpServletRequestWrapper {

	private final byte[] body;

	CachedBodyRequest(HttpServletRequest request, byte[] body) {
		super(request);
		this.body = body;
	}

	@Override
	public ServletInputStream getInputStream() {
		ByteArrayInputStream in = new ByteArrayInputStream(body);
		return new ServletInputStream() {
			@Override
			public boolean isFinished() {
				return in.available() == 0;
			}

			@Override
			public boolean isReady() {
				return true;
			}

			@Override
			public void setReadListener(ReadListener listener) {
				throw new UnsupportedOperationException();
			}

			@Override
			public int read() {
				return in.read();
			}

			@Override
			public int read(byte[] b, int off, int len) {
				return in.read(b, off, len);
			}
		};
	}

	@Override
	public BufferedReader getReader() throws IOException {
		String enc = getCharacterEncoding();
		Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
		return new BufferedReader(new InputStreamReader(getInputStream(), cs));
	}
}
