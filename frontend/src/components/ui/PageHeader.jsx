export function PageHeader({ title, description, icon: Icon, actions, }) {
    return (<div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon ? (<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
          <Icon className="h-5 w-5"/>
        </div>) : null}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>);
}
