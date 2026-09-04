// /loco/monorepo/webtorrent/src/core/bitfield.ts

/**
 * Estrutura de dados ultra-eficiente para rastrear o estado de peças (pieces).
 * Usa Uint8Array e operações bitwise para minimizar o uso de memória.
 */
export class Bitfield {
  private buffer: Uint8Array;
  public readonly length: number;

  constructor(length: number) {
    this.length = length;
    // Cada byte armazena 8 bits (peças). Math.ceil garante que cobrimos todas as peças.
    this.buffer = new Uint8Array(Math.ceil(length / 8));
  }

  /**
   * Verifica se a peça no índice fornecido já foi baixada/verificada.
   */
  get(index: number): boolean {
    if (index < 0 || index >= this.length) return false;
    const byteIndex = index >> 3; // Equivalente a Math.floor(index / 8)
    const bitIndex = 7 - (index & 7); // Equivalente a 7 - (index % 8)
    return (this.buffer[byteIndex]! & (1 << bitIndex)) !== 0;
  }

  /**
   * Marca a peça no índice fornecido como baixada/verificada.
   */
  set(index: number): void {
    if (index < 0 || index >= this.length) return;
    const byteIndex = index >> 3;
    const bitIndex = 7 - (index & 7);
    this.buffer[byteIndex]! |= (1 << bitIndex);
  }

  /**
   * Conta quantas peças já foram marcadas como completas.
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      // Conta os bits 1 em cada byte (Brian Kernighan's algorithm simplificado para 8 bits)
      let byte = this.buffer[i]!;
      while (byte) {
        byte &= byte - 1;
        count++;
      }
    }
    return count;
  }

  /**
   * Retorna uma cópia do buffer bruto (útil para serialização ou envio via Wire Protocol).
   */
  toBuffer(): Uint8Array {
    return this.buffer.slice();
  }
}