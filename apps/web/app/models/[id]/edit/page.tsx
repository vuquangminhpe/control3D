import { notFound } from "next/navigation";
import { ModelEditorWorkspace } from "@/components/ModelEditorWorkspace";
import {
  getElementTypes,
  getModelById,
  getVersionsForModel,
} from "@/lib/model-store";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ModelEditPage({ params }: PageProps) {
  const { id } = await params;
  const model = await getModelById(id);

  if (!model) {
    notFound();
  }

  const [elementTypes, versions] = await Promise.all([
    getElementTypes(),
    getVersionsForModel(id),
  ]);

  return (
    <ModelEditorWorkspace
      elementTypes={elementTypes}
      model={model}
      versions={versions}
    />
  );
}
