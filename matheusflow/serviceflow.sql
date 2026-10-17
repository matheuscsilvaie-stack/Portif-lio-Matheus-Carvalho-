-- Esquema inicial do MatheusFlow (PostgreSQL).
-- Não use dados reais de clientes no ambiente de demonstração.

CREATE TABLE clients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  service_name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'alta', 'urgente')),
  status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
    CHECK (status IN ('Pendente', 'Em andamento', 'Concluído')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tickets_status_created_at_idx ON tickets (status, created_at DESC);
CREATE INDEX tickets_client_id_idx ON tickets (client_id);
