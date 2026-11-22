/**
 * RESAP — Tools Data Registry
 * Central definition of all tools for nav, search, and pages.
 */
export const TOOL_CATEGORIES = [
  {
    id: 'image-tools',
    name: 'Image Tools',
    icon: 'image',
    description: 'Resize, compress, convert, and edit images.',
    tools: [
      { id: 'image-resizer', name: 'Image Resizer', desc: 'Resize images to exact dimensions', icon: 'maximize-2', url: '/tools/image-resizer.html' },
      { id: 'image-compressor', name: 'Image Compressor', desc: 'Compress images to reduce file size', icon: 'minimize-2', url: '/tools/image-compressor.html' },
      { id: 'image-converter', name: 'Image Format Converter', desc: 'Convert between JPG, PNG, WebP formats', icon: 'repeat', url: '/tools/image-converter.html' },
      { id: 'image-cropper', name: 'Image Cropper', desc: 'Crop images with aspect ratio presets', icon: 'crop', url: '/tools/image-cropper.html' },
      { id: 'photo-collage', name: 'Photo Collage Maker', desc: 'Create photo collages with grid layouts', icon: 'layout-grid', url: '/tools/photo-collage.html' },
    ]
  },
  {
    id: 'signature-passport',
    name: 'Signature & Passport Tools',
    icon: 'pen-tool',
    description: 'Prepare signatures and passport photos for applications.',
    tools: [
      { id: 'signature-resizer', name: 'Signature Resizer', desc: 'Resize signature images to required dimensions', icon: 'pen-line', url: '/tools/signature-resizer.html' },
      { id: 'signature-compressor', name: 'Signature Compressor', desc: 'Compress signature files to target size', icon: 'file-minus', url: '/tools/signature-compressor.html' },
      { id: 'signature-bg-remover', name: 'Signature Background Remover', desc: 'Remove background from signature images', icon: 'eraser', url: '/tools/signature-resizer.html' },
      { id: 'passport-photo-editor', name: 'Passport Photo Editor', desc: 'Crop and prepare passport-size photographs', icon: 'user-square', url: '/tools/passport-photo-editor.html' },
      { id: 'passport-sheet-maker', name: 'Passport Photo Sheet Maker', desc: 'Create printable passport photo sheets', icon: 'grid-3x3', url: '/tools/passport-sheet-maker.html' },
    ]
  },
  {
    id: 'pdf-tools',
    name: 'PDF Tools',
    icon: 'file-text',
    description: 'Compress, merge, split, and convert PDF documents.',
    tools: [
      { id: 'pdf-compressor', name: 'PDF Compressor', desc: 'Reduce PDF file size', icon: 'file-minus-2', url: '/tools/pdf-compressor.html' },
      { id: 'image-to-pdf', name: 'Image to PDF', desc: 'Convert images to PDF documents', icon: 'file-plus-2', url: '/tools/image-to-pdf.html' },
      { id: 'pdf-merger', name: 'PDF Merger', desc: 'Combine multiple PDF files into one', icon: 'files', url: '/tools/pdf-merger.html' },
      { id: 'pdf-splitter', name: 'PDF Splitter', desc: 'Split PDF into individual pages', icon: 'scissors', url: '/tools/pdf-splitter.html' },
      { id: 'pdf-page-extractor', name: 'PDF Page Extractor', desc: 'Extract specific pages from a PDF', icon: 'file-output', url: '/tools/pdf-splitter.html' },
      { id: 'pdf-to-images', name: 'PDF to Images', desc: 'Convert PDF pages to image files', icon: 'image-down', url: '/tools/pdf-splitter.html' },
      { id: 'pdf-page-organizer', name: 'PDF Page Organizer', desc: 'Reorder and organize PDF pages', icon: 'arrow-up-down', url: '/tools/pdf-merger.html' },
    ]
  }
];

export const ALL_TOOLS = TOOL_CATEGORIES.flatMap(cat =>
  cat.tools.map(tool => ({ ...tool, category: cat.name, categoryId: cat.id }))
);

/**
 * Get a random tool from the registry
 */
export function getRandomTool() {
  const mainTools = ALL_TOOLS.filter(t =>
    !['signature-bg-remover', 'pdf-page-extractor', 'pdf-to-images', 'pdf-page-organizer'].includes(t.id)
  );
  return mainTools[Math.floor(Math.random() * mainTools.length)];
}

/**
 * Search tools by query
 */
export function searchTools(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return ALL_TOOLS.filter(tool =>
    tool.name.toLowerCase().includes(q) ||
    tool.desc.toLowerCase().includes(q) ||
    tool.category.toLowerCase().includes(q)
  );
}
