import {
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

/**
 * Desktop/mobile environment preparation is isolated from the scene module so
 * HDR parsing and PMREM code can live in a second, independently cached chunk.
 */
export async function loadHeroEnvironment(
  renderer: WebGLRenderer,
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Texture> {
  const pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  let source: Texture | null = null
  try {
    source = await new HDRLoader().loadAsync(url, (event) => {
      onProgress?.(event.loaded, event.total)
    })
    return pmrem.fromEquirectangular(source).texture
  }
  finally {
    source?.dispose()
    pmrem.dispose()
  }
}
