-- ============================================================
-- Suite 53 · Cuánto ocupa un restaurante (PRD RN-ARC-10, decisión 48)
-- ============================================================
--
-- El diseño definitivo móvil (página 50) enseña el almacenamiento del
-- restaurante en sus archivos. Lo que esta suite vigila **no es la suma**
-- —sumar es fácil— sino las dos maneras de que esa cifra mienta:
--
--   · Que salga **filtrada por quien mira**. La RLS de `files` enseña a
--     cada quien lo suyo, así que un `sum()` hecho desde la pantalla le
--     daría al trabajador un número más pequeño llamándolo "lo que ocupa
--     el restaurante". La función suma **entero**.
--   · Que a quien no puede ver todos los archivos se le dé un **cero** en
--     vez de un motivo. Devuelve `null`, y la pantalla dice por qué.
--
-- Y de paso, lo que RN-ARC-05 protege: el trabajador no ve la
-- facturación, y tampoco su tamaño — de un tamaño se deduce más de lo que
-- parece.
--
-- Prefijo de esta suite: cd100000-.

begin;

set local role postgres;

-- ------------------------------------------------------------
-- Montaje
-- ------------------------------------------------------------
insert into auth.users (id, email, role, aud) values
  ('cd100000-0000-0000-0000-000000000001', 'duena@suite53.test', 'authenticated', 'authenticated'),
  ('cd100000-0000-0000-0000-000000000002', 'trabajador@suite53.test', 'authenticated', 'authenticated'),
  ('cd100000-0000-0000-0000-000000000003', 'cliente@suite53.test', 'authenticated', 'authenticated'),
  ('cd100000-0000-0000-0000-000000000004', 'ajena@suite53.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('cd100000-0000-0000-0000-000000000001', 'duena@suite53.test', 'Dueña 53'),
  ('cd100000-0000-0000-0000-000000000002', 'trabajador@suite53.test', 'Trabajador 53'),
  ('cd100000-0000-0000-0000-000000000003', 'cliente@suite53.test', 'Cliente 53'),
  ('cd100000-0000-0000-0000-000000000004', 'ajena@suite53.test', 'Ajena 53')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by)
values ('cd100000-0000-0000-0000-000000000010', 'Espacio 53', 'espacio-53', 'Europe/Madrid',
        'cd100000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('cd100000-0000-0000-0000-000000000010', 'cd100000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('cd100000-0000-0000-0000-000000000010', 'cd100000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name)
values ('cd100000-0000-0000-0000-000000000015', 'cd100000-0000-0000-0000-000000000010', 'Grupo 53');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('cd100000-0000-0000-0000-000000000020', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'R53-A', 'Magariños 53', 'active'),
  ('cd100000-0000-0000-0000-000000000021', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'R53-B', 'El Otro 53', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role)
values ('cd100000-0000-0000-0000-000000000020', 'cd100000-0000-0000-0000-000000000003', 'local_owner');

-- Tres archivos del primer restaurante: uno operativo compartido, uno
-- interno y uno de FACTURACIÓN, que es el que el trabajador no ve.
insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('cd100000-0000-0000-0000-000000000030', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'cd100000-0000-0000-0000-000000000020',
   'menus', 'shared_with_client', 'carta.pdf', 'cd100000-0000-0000-0000-000000000001'),
  ('cd100000-0000-0000-0000-000000000031', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'cd100000-0000-0000-0000-000000000020',
   'logos', 'internal', 'logo.png', 'cd100000-0000-0000-0000-000000000001'),
  ('cd100000-0000-0000-0000-000000000032', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'cd100000-0000-0000-0000-000000000020',
   'billing', 'internal', 'factura.pdf', 'cd100000-0000-0000-0000-000000000001'),
  -- Y uno del SEGUNDO restaurante, que no debe contar en el primero.
  ('cd100000-0000-0000-0000-000000000033', 'cd100000-0000-0000-0000-000000000010',
   'cd100000-0000-0000-0000-000000000015', 'cd100000-0000-0000-0000-000000000021',
   'menus', 'internal', 'otra-carta.pdf', 'cd100000-0000-0000-0000-000000000001');

-- 1000 + 2000 + 4000 en el primero (incluida la factura), 8000 en el
-- segundo. Los números son potencias para que, si la suma se equivoca, el
-- total diga EXACTAMENTE qué se dejó fuera.
insert into public.file_versions
  (file_id, space_id, version_number, storage_path, file_name, mime_type, size_bytes, created_by) values
  ('cd100000-0000-0000-0000-000000000030', 'cd100000-0000-0000-0000-000000000010', 1,
   'e/53/carta-v1.pdf', 'carta.pdf', 'application/pdf', 1000, 'cd100000-0000-0000-0000-000000000001'),
  ('cd100000-0000-0000-0000-000000000031', 'cd100000-0000-0000-0000-000000000010', 1,
   'e/53/logo-v1.png', 'logo.png', 'image/png', 2000, 'cd100000-0000-0000-0000-000000000001'),
  ('cd100000-0000-0000-0000-000000000032', 'cd100000-0000-0000-0000-000000000010', 1,
   'e/53/factura-v1.pdf', 'factura.pdf', 'application/pdf', 4000, 'cd100000-0000-0000-0000-000000000001'),
  ('cd100000-0000-0000-0000-000000000033', 'cd100000-0000-0000-0000-000000000010', 1,
   'e/53/otra-v1.pdf', 'otra-carta.pdf', 'application/pdf', 8000, 'cd100000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------
-- RN-ARC-10 · la suma es ENTERA y es de ESTE restaurante
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'cd100000-0000-0000-0000-000000000001';

do $$
declare
  v_bytes bigint;
begin
  v_bytes := public.establishment_storage_bytes('cd100000-0000-0000-0000-000000000020');

  if v_bytes is distinct from 7000 then
    raise exception 'RN-ARC-10 FALLA: esperaba 7000 (1000+2000+4000) y llegó %. %',
      v_bytes,
      case
        when v_bytes = 3000 then 'Faltan los 4000 de la factura: la suma sale filtrada por RLS.'
        when v_bytes = 15000 then 'Sobran los 8000 del otro restaurante: no se filtra por establecimiento.'
        else 'Revisa la unión de file_versions con files.'
      end;
  end if;

  -- Y el segundo restaurante cuenta lo suyo, que es la otra mitad de la
  -- misma comprobación: una función que devolviera siempre el total del
  -- espacio pasaría la de arriba y fallaría esta.
  if public.establishment_storage_bytes('cd100000-0000-0000-0000-000000000021') is distinct from 8000 then
    raise exception 'RN-ARC-10 FALLA: el segundo restaurante no cuenta lo suyo';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-ARC-10 · quien NO puede ver todos los archivos no recibe un número
-- ------------------------------------------------------------
--
-- Ni parcial ni cero: `null`, para que la pantalla diga el motivo.
set local "request.jwt.claim.sub" = 'cd100000-0000-0000-0000-000000000002';

do $$
declare
  v_bytes bigint;
begin
  v_bytes := public.establishment_storage_bytes('cd100000-0000-0000-0000-000000000020');

  if v_bytes is not null then
    raise exception 'RN-ARC-10 FALLA: el trabajador recibió % en vez de null. %', v_bytes,
      case when v_bytes = 3000
           then 'Es la suma SIN la facturación: RN-ARC-05 no le deja verla, y de su tamaño se deduce.'
           else 'Le llegó un número que no debería poder ver.' end;
  end if;
end;
$$;

-- El cliente tampoco, aunque el restaurante sea suyo: no es un dato del
-- panel del restaurante, es del equipo (página 50 del diseño).
set local "request.jwt.claim.sub" = 'cd100000-0000-0000-0000-000000000003';

do $$
begin
  if public.establishment_storage_bytes('cd100000-0000-0000-0000-000000000020') is not null then
    raise exception 'RN-ARC-10 FALLA: el cliente recibió el almacenamiento del restaurante';
  end if;
end;
$$;

-- Y quien no tiene nada que ver con el espacio, menos todavía.
set local "request.jwt.claim.sub" = 'cd100000-0000-0000-0000-000000000004';

do $$
begin
  if public.establishment_storage_bytes('cd100000-0000-0000-0000-000000000020') is not null then
    raise exception 'RN-ARC-10 FALLA: una persona ajena recibió el almacenamiento del restaurante';
  end if;

  -- Un establecimiento que no existe no se distingue de uno ajeno: las dos
  -- respuestas son `null`, y así el número no sirve para adivinar si un
  -- identificador existe.
  if public.establishment_storage_bytes('cd100000-0000-0000-0000-0000000000ff') is not null then
    raise exception 'RN-ARC-10 FALLA: un establecimiento inexistente devolvió algo';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RN-SUB-13 · esto NO es una cuota: el límite sigue siendo del espacio
-- ------------------------------------------------------------
--
-- Falso-cerrado. Si alguien añade un límite por restaurante sin reescribir
-- RN-ARC-10, esto se pone rojo y hay que venir a explicarlo.
set local role postgres;

do $$
declare
  v_sospechosas text;
begin
  select string_agg(c.relname || '.' || a.attname, ', ')
  into v_sospechosas
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'establishments'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname like '%storage%';

  if v_sospechosas is not null then
    raise exception
      'RN-ARC-10 FALLA: `establishments` tiene columna de almacenamiento (%). El límite es del ESPACIO (RN-SUB-13): si esto es a propósito, reescribe RN-ARC-10',
      v_sospechosas;
  end if;
end;
$$;

-- La función sigue siendo `security definer`.
--
-- Hoy esto NO cambia ningún resultado y el test lo dice a propósito: con
-- el guarda en `manage_requests`, quien llega a la suma ve todos esos
-- archivos igualmente, así que `invoker` devolvería lo mismo y ninguna de
-- las comprobaciones de arriba se pondría roja. Se comprobó cambiándolo.
--
-- Por eso se afirma aquí y no allí: el día que el guarda se ablande —para
-- que un trabajador vea el dato de sus restaurantes, por ejemplo—,
-- `invoker` empezaría a devolver sumas parciales **en silencio**. Este
-- test es lo único que se interpone.
do $$
begin
  if not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'establishment_storage_bytes') then
    raise exception 'FALLA: `establishment_storage_bytes()` dejó de ser SECURITY DEFINER. Con el guarda de hoy no se nota; el día que se ablande, devolvería sumas parciales sin avisar (RN-ARC-10)';
  end if;
end;
$$;

-- Y la función está cerrada a quien no tiene sesión.
do $$
begin
  if has_function_privilege('anon', 'public.establishment_storage_bytes(uuid)', 'execute') then
    raise exception 'FALLA: `anon` puede ejecutar `establishment_storage_bytes()`';
  end if;

  if not has_function_privilege('authenticated', 'public.establishment_storage_bytes(uuid)', 'execute') then
    raise exception 'FALLA: `authenticated` no puede ejecutarla, y la pantalla la llama por RPC';
  end if;
end;
$$;

rollback;
