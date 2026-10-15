/* 动画组件模板（以 _ 开头的文件不会被载入）。复制本文件并改名即可新建组件。 */
QS.registerAnimation({
  id: 'my-anim',
  name: { en: 'Display name', zh: '组件显示名' },          // 也可以直接写字符串
  description: { en: 'What each stage does.', zh: '在编辑器里显示的说明：每个阶段做什么。' },
  params: [
    { key: 'n', label: { en: 'Qubits n', zh: '比特数 n' }, type: 'number', min: 1, max: 6, default: 3 },
  ],
  steps: 2, // 内部阶段数：块在 step 处出现（阶段 0），之后每按一次"下一步"进入下一阶段
  mount(el, p, api) {
    el.classList.add('anim-my');
    el.innerHTML = '<div class="my-box"></div>';
    const box = el.querySelector('.my-box');
    let state = {};

    function render(stage, animate) {
      el.classList.toggle('my-noanim', !animate);
      box.textContent = '阶段 ' + stage + '，n = ' + p.n;
    }

    return {
      update(stage, animate) { render(stage, animate); },
      setState(s) { state = s; },          // 另一个窗口里的交互同步过来
      destroy() {},
    };
  },
});
