-- Triggers pour alimenter le journal d'audit automatiquement (ventes et produits).
CREATE OR REPLACE FUNCTION public.audit_trigger_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    NEW.company_id,
    NEW.store_id,
    COALESCE(NEW.created_by, auth.uid()),
    'sale.create',
    'sale',
    NEW.id,
    jsonb_build_object('sale_number', NEW.sale_number, 'total', NEW.total, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_after_sale_insert ON public.sales;
CREATE TRIGGER audit_after_sale_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_sale();

-- Produits : création, modification, suppression (soft delete via deleted_at ou hard delete).
CREATE OR REPLACE FUNCTION public.audit_trigger_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
      NEW.company_id,
      auth.uid(),
      'product.create',
      'product',
      NEW.id,
      jsonb_build_object('name', NEW.name, 'sku', NEW.sku)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.company_id,
      auth.uid(),
      CASE WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN 'product.delete' ELSE 'product.update' END,
      'product',
      NEW.id,
      jsonb_build_object('name', OLD.name, 'sku', OLD.sku),
      jsonb_build_object('name', NEW.name, 'sku', NEW.sku)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data)
    VALUES (
      OLD.company_id,
      auth.uid(),
      'product.delete',
      'product',
      OLD.id,
      jsonb_build_object('name', OLD.name, 'sku', OLD.sku)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_after_product_insert ON public.products;
DROP TRIGGER IF EXISTS audit_after_product_update ON public.products;
DROP TRIGGER IF EXISTS audit_after_product_delete ON public.products;
CREATE TRIGGER audit_after_product_insert AFTER INSERT ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();
CREATE TRIGGER audit_after_product_update AFTER UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();
CREATE TRIGGER audit_after_product_delete AFTER DELETE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_product();
