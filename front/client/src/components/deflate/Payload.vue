<template>
  <p>yo</p>
</template>

<script>
import { testDeflate } from './puff';

export default {
  name: 'Payload',
  mounted() {
    testDeflate();
  },
};
</script>

<style scoped>

</style>
