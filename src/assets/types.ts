export type AssetCategory = 'trees' | 'items' | 'guns' | 'clothes' | 'structures' | 'rocks' | 'textures' | 'audio';
export type AssetDescriptor = {
  readonly id: string;
  readonly category: AssetCategory;
  readonly kind: 'procedural' | 'model' | 'texture' | 'audio';
  readonly displayName: string;
  readonly status: string;
};
