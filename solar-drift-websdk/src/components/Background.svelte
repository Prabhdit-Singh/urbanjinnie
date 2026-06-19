<script lang="ts">
	import { Rectangle, Sprite } from 'pixi-svelte';

	import { getContext } from '../game/context';

	const context = getContext();
	const canvas = $derived(context.stateLayoutDerived.canvasSizes());
</script>

<Rectangle {...context.stateLayoutDerived.canvasSizes()} backgroundColor={0x05010f} zIndex={-3} />

<Sprite
	key="background"
	x={canvas.width / 2}
	y={canvas.height / 2}
	anchor={0.5}
	width={canvas.width}
	height={canvas.height}
	zIndex={-2}
/>
