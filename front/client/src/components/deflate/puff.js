/* eslint-disable */

var StatusCodesEnum = {
  ERR_INPUT_TERMINATE: 2,
  ERR_OUTPUT_SPACE_EXHAUSTED: 1,
  OK: 0,
  ERR_INVALID_BLOCK_TYPE: -1,
  ERR_STORED_BLOCK_LEN_MISMATCH: -2,
  ERR_DYNAMIC_TOO_MANY_LEN_DIST_CODES: -3,
  ERR_DYNAMIC_CL_CODES_INCOMPLETE: -4,
  ERR_DYNAMIC_REPEAT_LENS_NO_FIRST: -5,
  ERR_DYNAMIC_REPEAT_MORE_THAN_SPEC: -6,
  ERR_DYNAMIC_INVALID_LIT_LEN_CL: -7,
  ERR_DYNAMIC_INVALID_DIST_CL: -8,
  ERR_DYNAMIC_NO_EOB_CODE: -9,
  ERR_INVALID_LIT_LEN_DIST_CODE: -10,
  ERR_DISTANCE_TOO_FAR_BACK: -11,
};
Object.freeze(StatusCodesEnum);

var EncodingTypeEnum = {
  STORED: "Stored Block",
  STATIC: "Static Encoding",
  DYNAMIC: "Dynamic Encoding",
  ERROR: "Unknown Encoding",
};
Object.freeze(EncodingTypeEnum);

function code_to_encoding_type(code) {
  switch(code) {
    case 0:
      return EncodingTypeEnum.STORED;
    case 1:
      return EncodingTypeEnum.STATIC;
    case 2:
      return EncodingTypeEnum.DYNAMIC;
    default:
      return EncodingTypeEnum.ERROR;
  }
}

const MAXBITS = 15;
const MAXLCODES = 286;
const MAXDCODES = 30;
const MAXCODES = (MAXLCODES + MAXDCODES);
const FIXLCODES = 288;

function decode(state, huffman) {
  let len;    // current number of bits in code
  let code;   // len bits being decoded
  let first;  // first code of length len
  let count;  // number of codes of length len
  let index;  // index of first code of length len in symbol table

  code = 0;
  first = 0;
  index = 0;

  for (len = 1; len <= MAXBITS; len++) {
    code |= bits(state, 1);
    count = huffman.count[len];
    if (code - count < first) {
      return huffman.symbol[index + (code - first)];
    }
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }

  return StatusCodesEnum.ERR_INVALID_LIT_LEN_DIST_CODE;
}

function codes(state) {
  const lens = [ /* Size base for length codes 257..285 */
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const lext = [ /* Extra bits for length codes 257..285 */
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const dists = [ /* Offset base for distance codes 0..29 */
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577];
  const dext = [ /* Extra bits for distance codes 0..29 */
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
    12, 12, 13, 13];

  let symbol = 0;
  let dist = 0;
  let len = 0;

  while (symbol !== 256) {
    symbol = decode(state, state.l_huffman);

    if (symbol < 0) {
      return symbol;    // invalid
    }

    if (symbol < 256) {
      // this is a literal and we should directly write it out to the buffer
      if (state.output_buf != null) {
        if (state.output_buf.length === state.outcnt) {
          return StatusCodesEnum.ERR_OUTPUT_SPACE_EXHAUSTED;
        }
        state.output_buf[state.outcnt] = symbol;
      }
      state.outcnt++;
    }

    else if (symbol > 256) {
      // this is a length symbol and needs to be decoded
      symbol -= 257;  // minimum len symbol will be 257, meaning 0

      if (symbol >= 29) {
        return StatusCodesEnum.ERR_INVALID_LIT_LEN_DIST_CODE;
      }
      len = lens[symbol] + bits(state, lext[symbol]);

      /* get and check distance*/
      symbol = decode(state, state.d_huffman);
      console.log("SYMBOL - Distance: " + symbol);

      dist = dists[symbol] + bits(state, dext[symbol]);
      if (dist > state.outcnt) {
        return StatusCodesEnum.ERR_DISTANCE_TOO_FAR_BACK;
      }

      if (state.output_buf != null) {
        if (state.outcnt + len > state.output_buf.length) {
          return StatusCodesEnum.ERR_OUTPUT_SPACE_EXHAUSTED;
        }

        // copy length bytes from distance bytes back
        while (len--) {
          state.output_buf[state.outcnt] = state.output_buf[state.outcnt - dist];
          state.outcnt++;
        }
      }
    }
  }
}

function gen_static_huffman_codes(state) {
  state.l_huffman = new HuffmanTree(FIXLCODES);
  state.d_huffman = new HuffmanTree(MAXDCODES);

  var litlen_cl = new Uint8Array(FIXLCODES);
  var dist_cl = new Uint8Array(MAXDCODES);

  // lit/len code length table
  for (let i = 0; i < 144; i++) {
    litlen_cl[i] = 8;
  }

  for (let i = 144; i < 256; i++) {
    litlen_cl[i] = 9;
  }

  for (let i = 256; i < 280; i++) {
    litlen_cl[i] = 7;
  }

  for (let i = 280; i < FIXLCODES; i++) {
    litlen_cl[i] = 8;
  }

  // dist code length table
  for (let i = 0; i < MAXDCODES; i++) {
    dist_cl[i] = 5;
  }

  state.l_huffman.gen_codes(litlen_cl);
  state.d_huffman.gen_codes(dist_cl);

  // console.log(state.d_huffman);

  codes(state);
}

class State {
  constructor() {
    /* Output state */
    this.output_buf = null;     // output buffer
    this.outlen = 0;            // available state in the out buf
    this.outcnt = 0;            // number of bytes written to out buf

    /* Input state */
    this.intput_buf = null;     // input buffer
    this.incnt = 0;             // bytes read so far

    this.bitbuf = 0;            // bit buffer
    this.bitcnt = 0;            // number of bits in the bit buffer

    /* Huffman trees */
    this.l_huffman = null;
    this.d_huffman = null;
  };

  set_header(bfinal, encoding) {
    this.bfinal = bfinal;
    console.log("Bfinal bit: " + this.bfinal);

    this.encoding = code_to_encoding_type(encoding);
    console.log(this.encoding);
  }

  init_buffers(instring, outlen) {
    this.output_buf = new Uint8Array(outlen);
    this.input_buf = new Uint8Array(instring);
  };
}

class HuffmanTree {
  constructor(size) {
    this.count = new Uint32Array(MAXBITS+1);
    this.symbol = new Uint32Array(size);
  };

  gen_codes(code_length_array) {
    // Begin by counting the number of each code length that exists
    for (let i = 0; i < code_length_array.length; i++) {
      this.count[code_length_array[i]]++;
    }

    

    // No codes found - though technically a complete tree, this will fail decode
    if (this.count[0] === code_length_array.length) {
      console.log("Found a tree of height zero");
      return 0;
    }

    // Ensure that there are no oversubscribed or incomplete lengths
    var remaining = 1;
    for (let i = 1; i <= MAXBITS; i++) {
      remaining <<= 1;    // another bit, double the possible remaining codes
      remaining -= this.count[i];
      if (remaining < 0) {
        return remaining;
      }
    }

    // Generate offsets into symbol table for each length for sorting
    var offsets = new Uint32Array(MAXBITS+1);
    offsets[1] = 0;
    for (let i = 1; i < MAXBITS; i++) {
      offsets[i+1] = offsets[i] + this.count[i];
    }

    // Generate the actual symbols for each code length
    for (let i = 0; i < code_length_array.length; i++) {
      var cl = code_length_array[i];
      if (cl !== 0) {
        this.symbol[offsets[cl]++] = i;
      }
    }
  }

}

/*
 * Returns the needed bits from the input stream
 */
function bits(state, need) {
  // read from the current bit buffer
  let val = state.bitbuf;

  while (state.bitcnt < need) {
    if (state.incnt === state.input_buf.length) {
      return StatusCodesEnum.ERR_INPUT_TERMINATE;
    }
    val |= ((state.input_buf[state.incnt++]) << state.bitcnt);
    state.bitcnt += 8;
  }

  // drop 'need' bits and update the buffer
  state.bitbuf = (val >> need);
  state.bitcnt -= need;

  // zero the bits above "need" and return
  return (val & ((1 << need) - 1));
}

/*export const testDeflate = () =>*/ function init() {
  let s = new State();

  var dcpr_file = [203,200,84,40,201,200,44,86,0,162,228,196,220,212,162,
    252,60,133,172,252,188,212,98,174,140,81,137,81,137,81,9,210,37,0];

  s.init_buffers(dcpr_file, 10000);

  let bfinal = bits(s,1);
  let encoding = bits(s,2);

  s.set_header(bfinal, encoding);

  if (s.encoding === EncodingTypeEnum.STATIC) {
    gen_static_huffman_codes(s);
  }
};

init();

